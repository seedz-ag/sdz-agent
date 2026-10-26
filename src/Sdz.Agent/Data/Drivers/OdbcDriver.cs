using System.Data.Common;
using System.Data.Odbc;
using Sdz.Agent.Core.Logging;

namespace Sdz.Agent.Data.Drivers;

public sealed class OdbcDriver : AdoDriverBase
{
    protected override string DriverName => "ODBC";

    public OdbcDriver(DatabaseConfig config, Logger logger) : base(config, logger) { }

    protected override DbConnection CreateConnection() =>
        new OdbcConnection(Config.ConnectionString ?? "") { ConnectionTimeout = 999 };

    public override Task<string> GetVersionAsync(CancellationToken ct = default) => Task.FromResult("");

    public override Task<List<Row>> QueryAsync(string query, int? page, int? limit, CancellationToken ct = default) =>
        ExecuteAsync(LimitOffset(query, page, limit), ct);
}
