using System.Data.Common;
using System.Text.RegularExpressions;
using Microsoft.Data.SqlClient;
using Sdz.Agent.Api;
using Sdz.Agent.Core.Logging;

namespace Sdz.Agent.Data.Drivers;

public sealed class MssqlDriver : AdoDriverBase
{
    protected override string DriverName => "MSSQL";

    public MssqlDriver(DatabaseConfig config, Logger logger) : base(config, logger) { }

    protected override DbConnection CreateConnection()
    {
        var builder = new SqlConnectionStringBuilder
        {
            UserID = Config.Username ?? "",
            Password = Config.Password ?? "",
            DataSource = Config.Port is { } port ? $"{Config.Host ?? ""},{port}" : Config.Host ?? "",
            InitialCatalog = Config.Schema ?? "",
            TrustServerCertificate = true,
            Encrypt = SqlConnectionEncryptOption.Optional,
            ConnectTimeout = 60,
            Pooling = false,
        };
        return new SqlConnection(builder.ConnectionString);
    }

    public override string? BuildQuery(string query, IReadOnlyList<Parameter> parameters)
    {
        foreach (var parameter in parameters)
        {
            var value = parameter.Key != "START_DATE" ? parameter.Value : $"'{parameter.Value}'";
            query = Regex.Replace(query, Regex.Escape("{" + parameter.Key + "}"), value.Replace("$", "$$"));
        }
        return query;
    }

    public override Task<string> GetVersionAsync(CancellationToken ct = default) => Task.FromResult("");

    public override Task<List<Row>> QueryAsync(string query, int? page, int? limit, CancellationToken ct = default)
    {
        if (!query.ToUpperInvariant().Contains("ORDER BY"))
        {
            var statement = page is not null && limit is > 0
                ? $"{query} ORDER BY TIPOQUERY ASC, R_E_C_N_O_ ASC OFFSET {page * limit} ROWS FETCH NEXT {limit} ROWS ONLY"
                : query;
            return ExecuteAsync(statement, ct);
        }

        if (page is not null && limit is > 0)
        {
            return ExecuteAsync($"{query} OFFSET {page * limit} ROWS FETCH NEXT {limit} ROWS ONLY", ct);
        }

        return ExecuteAsync(query, ct);
    }
}
