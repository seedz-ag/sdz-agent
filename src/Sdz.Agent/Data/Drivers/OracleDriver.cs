using System.Data.Common;
using System.Text.RegularExpressions;
using Oracle.ManagedDataAccess.Client;
using Sdz.Agent.Core.Logging;

namespace Sdz.Agent.Data.Drivers;

/// <summary>Oracle through the fully managed driver: no Instant Client, no LD_LIBRARY_PATH.</summary>
public sealed class OracleDriver : AdoDriverBase
{
    private string? _version;

    protected override string DriverName => "ORACLE";

    public OracleDriver(DatabaseConfig config, Logger logger) : base(config, logger) { }

    protected override DbConnection CreateConnection()
    {
        var builder = new OracleConnectionStringBuilder
        {
            UserID = Config.Username ?? "",
            Password = Config.Password ?? "",
            DataSource = $"{Config.Host}:{Config.Port}/{Config.Service}",
            Pooling = false,
            ConnectionTimeout = 60,
        };
        return new OracleConnection(builder.ConnectionString);
    }

    protected override async Task AfterOpenAsync(DbConnection connection, CancellationToken ct)
    {
        if (string.IsNullOrWhiteSpace(Config.Schema)) return;
        await using var command = connection.CreateCommand();
        command.CommandText = $"ALTER SESSION SET CURRENT_SCHEMA = {Config.Schema}";
        await command.ExecuteNonQueryAsync(ct).ConfigureAwait(false);
    }

    protected override void ConfigureCommand(DbCommand command)
    {
        if (command is OracleCommand oracle)
        {
            oracle.FetchSize = 4 * 1024 * 1024;
            oracle.InitialLONGFetchSize = -1;
            oracle.InitialLOBFetchSize = -1;
        }
    }

    public override async Task<string> GetVersionAsync(CancellationToken ct = default)
    {
        if (Connection is null) await ConnectAsync(ct).ConfigureAwait(false);
        if (_version is null)
        {
            var rows = await ReadAsync("SELECT * FROM PRODUCT_COMPONENT_VERSION", ct).ConfigureAwait(false);
            _version = rows.Count > 0 && rows[0].TryGetValue("VERSION", out var v) && v is not null
                ? v.ToString()!.Split('.')[0]
                : "";
        }
        return _version;
    }

    public override async Task<List<Row>> QueryAsync(string query, int? page, int? limit, CancellationToken ct = default)
    {
        if (string.IsNullOrEmpty(_version))
        {
            try { _version = await GetVersionAsync(ct).ConfigureAwait(false); }
            catch (Exception e) { Logger.Error("ORACLE EXECUTE ERROR", "SELECT * FROM PRODUCT_COMPONENT_VERSION", e); }
        }

        if (int.TryParse(_version, out var major) && major > 11)
        {
            var parts = new List<string> { query };
            if (page is > 0 && limit is > 0) parts.Add($"OFFSET {page * limit} ROWS");
            if (limit is > 0) parts.Add($"FETCH NEXT {limit} ROWS ONLY");
            return await ExecuteAsync(string.Join(" ", parts), ct).ConfigureAwait(false);
        }

        // legacy (<= 11g) ROWNUM wrapper, reproduced from the TS including its arithmetic
        var tmp = Regex.Split(query, "from", RegexOptions.IgnoreCase);
        tmp[0] = $"{tmp[0]}, ROWNUM AS OFFSET ";
        var inner = string.Join("FROM", tmp);
        var p = page ?? 0;
        var legacy = new List<string> { $"SELECT * FROM ({inner})" };
        if (limit is > 0)
        {
            legacy.Add($"WHERE OFFSET  > {Math.Max(p, 0) * limit}");
            // TS: Math.max(page || 0 + 1, 1) -> page when page is truthy, else 1
            var upper = p != 0 ? p : 1;
            legacy.Add($"AND OFFSET <= {Math.Max(upper, 1) * limit}");
        }
        return await ExecuteAsync(string.Join(" ", legacy), ct).ConfigureAwait(false);
    }
}
