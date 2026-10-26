using Sdz.Agent.Adapters;
using Sdz.Agent.Api;
using Sdz.Agent.Core;
using Sdz.Agent.Core.Logging;
using Sdz.Agent.Transports;

namespace Sdz.Agent.Consumers;

/// <summary>Port of FTPConsumer: downloads every file of the configured extension and ships it through the transport.</summary>
public sealed class FtpConsumer : IConsumer
{
    private readonly AgentEnvironment _env;
    private readonly AgentPaths _paths;
    private readonly FtpAdapter _ftp;
    private readonly Logger _logger;
    private Setting _setting = new();
    private ITransport? _transport;

    public FtpConsumer(AgentEnvironment env, AgentPaths paths, FtpAdapter ftp, Logger logger)
    {
        _env = env;
        _paths = paths;
        _ftp = ftp;
        _logger = logger;
    }

    public IConsumer SetSetting(Setting setting)
    {
        _setting = setting;
        var ftp = setting.Parameters
            .Where(p => p.Key.StartsWith("FTP_", StringComparison.Ordinal))
            .ToDictionary(p => p.Key[4..].ToLowerInvariant(), p => p.Value);
        _ftp.SetConfig(new FtpAdapterConfig
        {
            Host = ftp.GetValueOrDefault("host", ""),
            Username = ftp.GetValueOrDefault("username", ""),
            Password = ftp.GetValueOrDefault("password", ""),
            Port = int.TryParse(ftp.GetValueOrDefault("port"), out var port) ? port : 22,
        });
        return this;
    }

    public IConsumer SetTransport(ITransport transport) { _transport = transport; return this; }

    public async Task ConsumeAsync(CancellationToken ct = default)
    {
        if (_env.Type is "all" or "datasource")
        {
            await _ftp.ConnectAsync(ct).ConfigureAwait(false);
            await _ftp.DisconnectAsync().ConfigureAwait(false);
            return;
        }

        var scope = _env.Schema;

        foreach (var schema in _setting.Schemas)
        {
            ct.ThrowIfCancellationRequested();
            if (!string.IsNullOrEmpty(scope) && schema.Entity != scope) continue;
            if (schema.InputFormat != "AGENT" && Utils.HasAgentSchemaForCurrentEntity(_setting.Schemas, schema.Entity)) continue;

            var query = _setting.Queries.FirstOrDefault(q => q.Entity == schema.Entity);
            if (query is null)
            {
                _logger.Error("COULDN'T FIND QUERY COMMAND");
                throw new InvalidOperationException("COULDN'T FIND QUERY COMMAND");
            }

            _logger.Info($"CONSUMING {schema.Entity.ToUpperInvariant()}");
            try
            {
                Directory.CreateDirectory(_paths.OutputDir);
                await File.WriteAllTextAsync(_paths.Output($"{schema.Entity.ToLowerInvariant()}.json"), Json.Serialize(query), ct).ConfigureAwait(false);
            }
            catch { }

            await _ftp.ConnectAsync(ct).ConfigureAwait(false);
            var files = await _ftp.ListAsync(query.Command, schema.InputFormat, ct).ConfigureAwait(false);

            for (var i = 0; i < files.Count; i++)
            {
                var file = files[i];
                try
                {
                    var data = await _ftp.GetFileAsync($"{query.Command}{file.Name}", ct).ConfigureAwait(false);
                    await _transport!.SendAsync($"{schema.Entity}/{file.Name}", new object?[] { data }, ct).ConfigureAwait(false);
                    if (i < files.Count - 1) await Task.Delay(1000, ct).ConfigureAwait(false);
                }
                catch (Exception error)
                {
                    _logger.Error($"ERROR PROCESSING FILE {file.Name}", error.Message);
                }
            }

            await _ftp.DisconnectAsync().ConfigureAwait(false);
        }
    }
}
