using System.Globalization;
using System.Text.RegularExpressions;
using Sdz.Agent.Api;
using Sdz.Agent.Core;
using Sdz.Agent.Core.Logging;
using Sdz.Agent.Data.Drivers;

namespace Sdz.Agent.Data;

/// <summary>Port of DatabaseAdapter: picks the driver for DATABASE_DRIVER and interpolates query parameters.</summary>
public sealed class DatabaseAdapter
{
    private readonly AgentEnvironment _env;
    private readonly Logger _logger;
    private IDatabaseAdapter? _adapter;
    private DatabaseConfig? _config;
    private string _driver = "";
    private IReadOnlyList<Parameter> _parameters = Array.Empty<Parameter>();

    public static readonly string[] SupportedDrivers =
        { "FIREBIRD", "MYSQL", "MSSQL", "MONGODB", "ODBC", "ORACLE", "POSTGRES", "REDSHIFT" };

    public DatabaseAdapter(AgentEnvironment env, Logger logger)
    {
        _env = env;
        _logger = logger;
    }

    public string Driver => _driver;

    public async Task InitializeAsync(string driver, DatabaseConfig config, IReadOnlyList<Parameter> parameters, CancellationToken ct = default)
    {
        _driver = driver.ToUpperInvariant();
        _config = config;
        _parameters = parameters;
        await ConnectAsync(ct).ConfigureAwait(false);
    }

    private async Task ConnectAsync(CancellationToken ct)
    {
        try
        {
            if (_adapter is not null)
            {
                await _adapter.DisposeAsync().ConfigureAwait(false);
                _adapter = null;
            }
            _adapter = Create(_driver, _config!, _logger);
            await _adapter.ConnectAsync(ct).ConfigureAwait(false);
        }
        catch (Exception exception)
        {
            _logger.Error("DATABASE CONNECT ERROR", exception);
        }
    }

    public static IDatabaseAdapter Create(string driver, DatabaseConfig config, Logger logger) => driver.ToUpperInvariant() switch
    {
        "FIREBIRD" => new FirebirdDriver(config, logger),
        "MYSQL" => new MysqlDriver(config, logger),
        "MSSQL" => new MssqlDriver(config, logger),
        "MONGODB" => new MongoDbDriver(config, logger),
        "ODBC" => new OdbcDriver(config, logger),
        "ORACLE" => new OracleDriver(config, logger),
        "POSTGRES" or "REDSHIFT" => new PostgresDriver(config, logger),
        _ => throw new NotSupportedException($"DATABASE DRIVER NOT SUPPORTED: {driver}"),
    };

    public string BuildQuery(string query)
    {
        var parameters = new List<Parameter>(_parameters);

        var lastExtraction = parameters.FirstOrDefault(p => p.Key == "LAST_EXTRACTION")?.Value;
        if (!string.IsNullOrEmpty(lastExtraction))
        {
            _logger.Info($"SETTING LAST_EXTRACTION {lastExtraction}");
        }

        var days = _env.ExtractLastNDays;
        if (days == 0 && DateTime.TryParseExact(lastExtraction, "yyyy-MM-dd", CultureInfo.InvariantCulture, DateTimeStyles.None, out var last))
        {
            days = (int)Math.Ceiling(Math.Abs((DateTime.Now - last).TotalDays));
        }

        _logger.Info($"RESOLVED EXTRACTION N DAYS: {days}");

        if (days != 0)
        {
            parameters.Add(new Parameter
            {
                Key = "START_DATE",
                Value = $"{DateTime.Now.AddDays(-days):yyyy-MM-dd} 00:00:00",
            });
        }

        return _adapter?.BuildQuery(query, parameters) ?? DefaultBuildQuery(query, parameters);
    }

    private static string DefaultBuildQuery(string query, IEnumerable<Parameter> parameters)
    {
        foreach (var parameter in parameters)
        {
            query = Regex.Replace(query, Regex.Escape("{" + parameter.Key + "}"), parameter.Value.Replace("$", "$$"));
        }
        return query;
    }

    public async Task<bool> CheckConnectionAsync(CancellationToken ct = default)
    {
        var specific = _adapter is null ? null : await _adapter.CheckConnectionAsync(ct).ConfigureAwait(false);
        if (specific is { } result) return result;
        var rows = await ExecuteAsync("SELECT 1", ct).ConfigureAwait(false);
        return rows.Count > 0;
    }

    public Task<List<Row>> ExecuteAsync(string query, CancellationToken ct = default) =>
        Required().ExecuteAsync(query, ct);

    public async Task<object> ExecuteQueryRemoteAsync(string query, CancellationToken ct = default) =>
        _adapter is null ? new List<Row>() : await _adapter.ExecuteQueryRemoteAsync(query, ct).ConfigureAwait(false);

    public Task<string> GetVersionAsync(CancellationToken ct = default) => Required().GetVersionAsync(ct);

    public Task<List<Row>> QueryAsync(string query, int? page, int? limit, CancellationToken ct = default) =>
        Required().QueryAsync(BuildQuery(query), page, limit, ct);

    public async Task DisconnectAsync(CancellationToken ct = default)
    {
        if (_adapter is null) return;
        await _adapter.DisposeAsync().ConfigureAwait(false);
        _adapter = null;
    }

    private IDatabaseAdapter Required() =>
        _adapter ?? throw new InvalidOperationException("DATABASE ADAPTER NOT INITIALIZED");
}
