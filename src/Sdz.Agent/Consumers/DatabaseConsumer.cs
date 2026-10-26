using Sdz.Agent.Api;
using Sdz.Agent.Core;
using Sdz.Agent.Core.Logging;
using Sdz.Agent.Data;
using Sdz.Agent.Services;
using Sdz.Agent.Transports;

namespace Sdz.Agent.Consumers;

/// <summary>Port of DatabaseConsumer: runs each schema's queries page by page and ships raw + hydrated rows.</summary>
public sealed class DatabaseConsumer : IConsumer
{
    private readonly DatabaseAdapter _database;
    private readonly AgentEnvironment _env;
    private readonly AgentPaths _paths;
    private readonly HydratorService _hydrator;
    private readonly Logger _logger;
    private readonly Utils _utils;
    private Setting _setting = new();
    private ITransport? _transport;

    public DatabaseConsumer(DatabaseAdapter database, AgentEnvironment env, AgentPaths paths, HydratorService hydrator, Logger logger, Utils utils)
    {
        _database = database;
        _env = env;
        _paths = paths;
        _hydrator = hydrator;
        _logger = logger;
        _utils = utils;
    }

    public IConsumer SetSetting(Setting setting) { _setting = setting; return this; }
    public IConsumer SetTransport(ITransport transport) { _transport = transport; return this; }

    public async Task ConsumeAsync(CancellationToken ct = default)
    {
        _logger.Info("CONNETING TO DATABASE");

        var config = Utils.ExtractDatabaseConfig(_setting.Parameters);
        var driver = _setting.Parameter("DATABASE_DRIVER")?.ToUpperInvariant();
        if (string.IsNullOrEmpty(driver))
        {
            _logger.Error("DATABASE DRIVER NOT FOUND");
            return;
        }

        await _database.InitializeAsync(driver, config, _setting.Parameters, ct).ConfigureAwait(false);
        _logger.Info("DATABASE CONNECTED");

        if (_env.Type is "all" or "datasource")
        {
            _logger.Info("EXECUTING DATABASE CHECK");
            var ok = await _database.CheckConnectionAsync(ct).ConfigureAwait(false);
            _logger.Info("DATABASE CHECK DONE");
            if (!ok) throw new InvalidOperationException("DATABASE CHECK FAILED");
            return;
        }

        var scope = _env.Schema;
        if (!string.IsNullOrEmpty(scope)) _logger.Info($"RUNNING EXTRACTION ONLY FOR SCHEMA: {scope}");

        var totalStart = DateTime.UtcNow;
        var limit = int.TryParse(_setting.Parameter("PAGE_SIZE"), out var pageSize) && pageSize > 0 ? pageSize : 1000;

        foreach (var schema in _setting.Schemas)
        {
            ct.ThrowIfCancellationRequested();
            if (!string.IsNullOrEmpty(scope) && schema.Entity != scope) continue;
            if (schema.InputFormat != "AGENT" && Utils.HasAgentSchemaForCurrentEntity(_setting.Schemas, schema.Entity)) continue;

            var entityStart = DateTime.UtcNow;
            var entity = schema.Entity.ToUpperInvariant();
            _logger.Info($"CONSUMING {entity}");

            var queries = _setting.Queries.Where(q => q.Entity == schema.Entity).ToList();
            if (queries.Count == 0)
            {
                _logger.Error("SQL NOT FOUND");
                throw new InvalidOperationException("SQL NOT FOUND");
            }

            var needsHydrate = Utils.NeedsToHydrate(schema);

            for (var index = 0; index < queries.Count; index++)
            {
                var sql = queries[index];
                var page = 0;
                try
                {
                    Directory.CreateDirectory(_paths.OutputDir);
                    await File.WriteAllTextAsync(_paths.Output($"{schema.Entity}-{index}.sql"), sql.Command, ct).ConfigureAwait(false);
                }
                catch { }

                if (needsHydrate) _logger.Info($"DATA FOR: {entity} WILL BE TRANFORMED USING SCHEMA MAPS");
                _logger.Info($"EXECUTE SQL QUERY WITH LIMIT: {limit}");

                var response = await RunPageAsync(sql.Command, entity, page, limit, ct).ConfigureAwait(false);

                while (response.Count > 0)
                {
                    ct.ThrowIfCancellationRequested();
                    var raw = response.Cast<object?>().ToList();
                    var data = needsHydrate
                        ? response.Select(row => (object?)_hydrator.Hydrate(schema.Maps, row)).ToList()
                        : raw;

                    var resourceName = string.IsNullOrEmpty(schema.ApiResource) ? schema.Entity : schema.ApiResource;

                    if (_setting.Channel != "SAAS_S3")
                    {
                        await Task.WhenAll(
                            _utils.WriteJsonAsync($"raw-{resourceName}", raw),
                            _transport!.SendAsync($"raw/{resourceName}", raw, ct)).ConfigureAwait(false);
                        await _utils.WaitAsync(_env.Throttle, ct).ConfigureAwait(false);
                    }

                    var resource = _setting.Channel == "SAAS_S3" ? schema.Entity : schema.ApiResource;
                    await Task.WhenAll(
                        _utils.WriteJsonAsync(resourceName, data),
                        _transport!.SendAsync(string.IsNullOrEmpty(resource) ? schema.Entity : resource, data, ct)).ConfigureAwait(false);
                    await _utils.WaitAsync(_env.Throttle, ct).ConfigureAwait(false);

                    page++;
                    response = await RunPageAsync(sql.Command, entity, page, limit, ct).ConfigureAwait(false);
                }
            }

            _logger.Info($"ENTITY {entity} EXTRACTION COMPLETED IN {Utils.FormatDuration((DateTime.UtcNow - entityStart).TotalMilliseconds)}");
        }

        _logger.Info($"TOTAL EXTRACTION COMPLETED IN {Utils.FormatDuration((DateTime.UtcNow - totalStart).TotalMilliseconds)}");
    }

    private async Task<List<Row>> RunPageAsync(string command, string entity, int page, int limit, CancellationToken ct)
    {
        var started = DateTime.UtcNow;
        try
        {
            var response = await _database.QueryAsync(command, page, limit, ct).ConfigureAwait(false);
            _logger.Info($"SQL QUERY [{entity}] PAGE {page} RETURNED {response.Count} ROWS IN {Utils.FormatDuration((DateTime.UtcNow - started).TotalMilliseconds)}");
            return response;
        }
        catch (Exception error)
        {
            _logger.Error($"SQL QUERY FAILED FOR ENTITY {entity}{(page > 0 ? $" PAGE {page}" : "")}: {error.Message}");
            throw;
        }
    }
}
