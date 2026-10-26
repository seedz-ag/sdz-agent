using Sdz.Agent.Api;
using Sdz.Agent.Core;
using Sdz.Agent.Core.Logging;
using Sdz.Agent.Data;
using Xunit;

namespace Sdz.Agent.Tests.Data;

/// <summary>
/// Runs only when SDZ_TEST_MYSQL_HOST/USER/PASSWORD are set (e.g. the SEEDZ "MYSQL - NAO REMOVER MINIMO" dev setting).
/// </summary>
public class MySqlIntegrationTests
{
    private static string? Env(string key) => Environment.GetEnvironmentVariable(key);
    private static bool Enabled => !string.IsNullOrEmpty(Env("SDZ_TEST_MYSQL_HOST"));

    private sealed class CaptureSink : ILogSink
    {
        public List<LogEntry> Entries { get; } = new();
        public void Write(LogEntry entry) => Entries.Add(entry);
    }

    private static (DatabaseAdapter adapter, CaptureSink sink, List<Parameter> parameters) Build()
    {
        var dir = Path.Combine(Path.GetTempPath(), "sdz-agent-mysql-" + Guid.NewGuid().ToString("N"));
        Directory.CreateDirectory(dir);
        var paths = new AgentPaths(dir);
        var env = new AgentEnvironment(paths, skipCredentialValidation: true);
        var logger = new Logger();
        var sink = new CaptureSink();
        logger.Attach(sink);

        var parameters = new List<Parameter>
        {
            new() { Key = "DATABASE_DRIVER", Value = "MYSQL" },
            new() { Key = "DATABASE_HOST", Value = Env("SDZ_TEST_MYSQL_HOST")! },
            new() { Key = "DATABASE_PORT", Value = Env("SDZ_TEST_MYSQL_PORT") ?? "3306" },
            new() { Key = "DATABASE_USERNAME", Value = Env("SDZ_TEST_MYSQL_USER")! },
            new() { Key = "DATABASE_PASSWORD", Value = Env("SDZ_TEST_MYSQL_PASSWORD")! },
            new() { Key = "LAST_EXTRACTION", Value = DateTime.Today.AddDays(-3).ToString("yyyy-MM-dd") },
        };
        return (new DatabaseAdapter(env, logger), sink, parameters);
    }

    [SkippableFact]
    public async Task Connects_and_checks_connection()
    {
        Skip.IfNot(Enabled);
        var (adapter, sink, parameters) = Build();
        await adapter.InitializeAsync("MYSQL", Utils.ExtractDatabaseConfig(parameters), parameters);
        Assert.True(await adapter.CheckConnectionAsync(), string.Join("\n", sink.Entries.Select(e => string.Join(" ", e.ToArray()))));
        Assert.Matches(@"^\d+\.", await adapter.GetVersionAsync());
        await adapter.DisconnectAsync();
    }

    [SkippableFact]
    public async Task Paginates_mock_tables_and_serializes_rows()
    {
        Skip.IfNot(Enabled);
        var (adapter, sink, parameters) = Build();
        await adapter.InitializeAsync("MYSQL", Utils.ExtractDatabaseConfig(parameters), parameters);

        var page0 = await adapter.QueryAsync("SELECT * FROM agent_mock.clientes", 0, 5);
        var page1 = await adapter.QueryAsync("SELECT * FROM agent_mock.clientes", 1, 5);
        var all = await adapter.QueryAsync("SELECT * FROM agent_mock.clientes", null, null);

        Assert.NotEmpty(page0);
        Assert.True(page0.Count <= 5);
        Assert.True(all.Count >= page0.Count);
        if (all.Count > 5) Assert.NotEqual(Json.Serialize(page0[0]), Json.Serialize(page1[0]));

        var json = Json.Serialize(page0, indented: true);
        Assert.Contains("\"", json);
        Assert.DoesNotContain("DBNull", json);

        foreach (var table in new[] { "itens_de_nota", "notas", "itens", "itens_de_pedido", "pedidos", "contas_a_receber", "vendedores" })
        {
            var rows = await adapter.QueryAsync($"SELECT * FROM agent_mock.{table}", 0, 3);
            Assert.True(rows.Count >= 0, table);
        }

        Assert.DoesNotContain(sink.Entries, e => e.Level == "error");
        await adapter.DisconnectAsync();
    }

    [SkippableFact]
    public async Task Remote_query_returns_rows_or_error_message()
    {
        Skip.IfNot(Enabled);
        var (adapter, _, parameters) = Build();
        await adapter.InitializeAsync("MYSQL", Utils.ExtractDatabaseConfig(parameters), parameters);
        var ok = await adapter.ExecuteQueryRemoteAsync("SELECT 1 AS one");
        Assert.IsType<List<Row>>(ok);
        var bad = await adapter.ExecuteQueryRemoteAsync("SELECT * FROM agent_mock.tabela_que_nao_existe");
        Assert.IsType<string>(bad);
        await adapter.DisconnectAsync();
    }
}
