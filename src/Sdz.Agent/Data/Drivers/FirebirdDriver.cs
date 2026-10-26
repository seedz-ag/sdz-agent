using System.Data.Common;
using System.Text.RegularExpressions;
using FirebirdSql.Data.FirebirdClient;
using Sdz.Agent.Core.Logging;

namespace Sdz.Agent.Data.Drivers;

public sealed class FirebirdDriver : AdoDriverBase
{
    protected override string DriverName => "FIREBIRD";

    public FirebirdDriver(DatabaseConfig config, Logger logger) : base(config, logger) { }

    protected override DbConnection CreateConnection()
    {
        var builder = new FbConnectionStringBuilder
        {
            DataSource = Config.Host ?? "",
            Database = Config.Schema ?? "",
            UserID = Config.Username ?? "",
            Password = Config.Password ?? "",
            Charset = Config.Locale ?? "UTF8",
            Pooling = false,
        };
        if (Config.Port is { } port) builder.Port = port;
        return new FbConnection(builder.ConnectionString);
    }

    public override Task<string> GetVersionAsync(CancellationToken ct = default) => Task.FromResult("");

    public override Task<List<Row>> QueryAsync(string query, int? page, int? limit, CancellationToken ct = default)
    {
        var parts = new List<string> { "SELECT" };
        if (limit is > 0) parts.Add($"FIRST {limit}");
        if (limit is > 0 && page is > 0) parts.Add($"SKIP {limit * page}");
        parts.Add(Regex.Replace(query, "^SELECT", "", RegexOptions.IgnoreCase));
        return ExecuteAsync(string.Join(" ", parts), ct);
    }
}
