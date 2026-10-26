using Sdz.Agent.Api;
using Sdz.Agent.Core;
using Sdz.Agent.Core.Http;
using Sdz.Agent.Core.Logging;
using Sdz.Agent.Services;
using Sdz.Agent.Transports;

namespace Sdz.Agent.Commands;

/// <summary>Port of ExecuteCommand: one full extraction (setting → VPN → transport → consumer → touch).</summary>
public sealed class ExecuteCommand
{
    private readonly ApiService _api;
    private readonly ConsumerResolver _consumers;
    private readonly AgentEnvironment _env;
    private readonly HttpTransport _httpTransport;
    private readonly S3Transport _s3Transport;
    private readonly Logger _logger;
    private readonly Utils _utils;
    private readonly VpnService _vpn;
    private readonly SemaphoreSlim _gate = new(1, 1);

    public ExecuteCommand(ApiService api, ConsumerResolver consumers, AgentEnvironment env, HttpTransport httpTransport,
        S3Transport s3Transport, Logger logger, Utils utils, VpnService vpn)
    {
        _api = api;
        _consumers = consumers;
        _env = env;
        _httpTransport = httpTransport;
        _s3Transport = s3Transport;
        _logger = logger;
        _utils = utils;
        _vpn = vpn;
    }

    public bool IsRunning => _gate.CurrentCount == 0;

    public async Task ExecuteAsync(CancellationToken ct = default)
    {
        await _gate.WaitAsync(ct).ConfigureAwait(false);
        try
        {
            await RunAsync(ct).ConfigureAwait(false);
        }
        finally
        {
            _gate.Release();
        }
    }

    private async Task RunAsync(CancellationToken ct)
    {
        try
        {
            if (_env.Env is not null)
            {
                _env.SetDiscovery(await _api.DiscoveryAsync(ct).ConfigureAwait(false));
            }

            _api.EnableFileLogging();
            _logger.Info("STARTING EXECUTE COMMAND");

            _logger.Info("CLEANING CSV FILES");
            _utils.CleanOutput("csv");
            _logger.Info("CLEANING JSON FILES");
            _utils.CleanOutput("json");
            _logger.Info("CLEANING SQL FILES");
            _utils.CleanOutput("sql");
            _logger.Info("CLEANING OVPN FILES");
            _utils.CleanOutput("ovpn", "txt");

            Setting? setting = null;
            try
            {
                setting = await _api.GetSettingAsync(ct).ConfigureAwait(false);
            }
            catch (Exception e)
            {
                _logger.Error("SDZ-AGENT ERROR WHILING FIND SETTING:", e is HttpRequestFailedException h ? h.Describe() : e.Message);
            }

            if (setting is null) throw new InvalidOperationException("SDZ-AGENT COULDN'T FIND SETTING, ABORTING.");

            if (setting.Security is not null)
            {
                _logger.Info("CONNECTING TO VPN.");
                await _vpn.Configure(setting.Security).ConnectAsync(ct).ConfigureAwait(false);
            }

            var channel = setting.Channel.ToUpperInvariant();
            _logger.Info($"RESOLVING TRANSPORT: {channel}");
            ITransport? transport = channel switch
            {
                "AGENT" or "SAAS" => _httpTransport,
                "SAAS_S3" => _s3Transport,
                _ => null,
            };
            if (transport is null) throw new InvalidOperationException("TRANSPORT NOT FOUND");
            if (transport is S3Transport s3) s3.SetSetting(setting);
            _logger.Info("TRANSPORT RESOLVED");

            var consumer = _consumers.Resolve(setting.DataSource);
            consumer.SetSetting(setting);
            consumer.SetTransport(transport);

            _logger.Info("STARTING CONSUMER");
            await consumer.ConsumeAsync(ct).ConfigureAwait(false);
            _logger.Info("CONSUMER DONE");

            await _api.TouchSettingAsync(ct).ConfigureAwait(false);
            _logger.Info("ENDING PROCESS");
        }
        catch (Exception error)
        {
            _logger.Error($"SDZ-AGENT EXECUTE ERROR: {error.Message}");
            throw;
        }
        finally
        {
            if (_vpn.IsConnected) await _vpn.DisconnectAsync().ConfigureAwait(false);
        }
    }
}
