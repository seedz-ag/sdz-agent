using System.Data.Common;
using Npgsql;
using Sdz.Agent.Core.Logging;

namespace Sdz.Agent.Data.Drivers;

/// <summary>Used for both POSTGRES and REDSHIFT (the TS mapped REDSHIFT to the pg adapter).</summary>
public sealed class PostgresDriver : AdoDriverBase
{
    protected override string DriverName => "POSTGRES";

    public PostgresDriver(DatabaseConfig config, Logger logger) : base(config, logger) { }

    protected override DbConnection CreateConnection()
    {
        var builder = new NpgsqlConnectionStringBuilder
        {
            Username = Config.Username ?? "",
            Password = Config.Password ?? "",
            Host = Config.Host ?? "",
            Database = Config.Schema ?? "",
            Pooling = false,
            CommandTimeout = 0,
        };
        if (Config.Port is { } port) builder.Port = port;
        return new NpgsqlConnection(builder.ConnectionString);
    }

    public override Task<string> GetVersionAsync(CancellationToken ct = default) => Task.FromResult("n/a");

    public override Task<List<Row>> QueryAsync(string query, int? page, int? limit, CancellationToken ct = default) =>
        ExecuteAsync(LimitOffset(query, page, limit), ct);
}
