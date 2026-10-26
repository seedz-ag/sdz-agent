using System.Data.Common;
using MySqlConnector;
using Sdz.Agent.Core.Logging;

namespace Sdz.Agent.Data.Drivers;

public sealed class MysqlDriver : AdoDriverBase
{
    protected override string DriverName => "MYSQL";

    public MysqlDriver(DatabaseConfig config, Logger logger) : base(config, logger) { }

    protected override DbConnection CreateConnection()
    {
        var builder = new MySqlConnectionStringBuilder
        {
            UserID = Config.Username ?? "",
            Password = Config.Password ?? "",
            Server = Config.Host ?? "",
            Database = Config.Schema ?? "",
            Pooling = false,
            DefaultCommandTimeout = 0,
        };
        if (Config.Port is { } port) builder.Port = (uint)port;
        return new MySqlConnection(builder.ConnectionString);
    }

    public override async Task<string> GetVersionAsync(CancellationToken ct = default)
    {
        var rows = await ExecuteAsync("SELECT VERSION() as version", ct).ConfigureAwait(false);
        return rows.Count > 0 && rows[0].TryGetValue("version", out var v) ? v?.ToString() ?? "" : "";
    }

    public override Task<List<Row>> QueryAsync(string query, int? page, int? limit, CancellationToken ct = default) =>
        ExecuteAsync(LimitOffset(query, page, limit), ct);
}
