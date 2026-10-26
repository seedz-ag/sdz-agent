using Sdz.Agent.Core;
using Xunit;

namespace Sdz.Agent.Tests.Core;

public class DotEnvAndEnvironmentTests : IDisposable
{
    private readonly string _dir = Path.Combine(Path.GetTempPath(), "sdz-agent-tests-" + Guid.NewGuid().ToString("N"));

    public DotEnvAndEnvironmentTests() => Directory.CreateDirectory(_dir);

    public void Dispose()
    {
        try { Directory.Delete(_dir, recursive: true); } catch { }
    }

    [Fact]
    public void DotEnv_roundtrips_values()
    {
        var path = Path.Combine(_dir, ".env");
        DotEnv.Write(path, new Dictionary<string, string> { ["API_URL"] = "https://x/", ["CLIENT_SECRET"] = "a b#c" });
        var read = DotEnv.Read(path);
        Assert.Equal("https://x/", read["API_URL"]);
        Assert.Equal("a b#c", read["CLIENT_SECRET"]);
    }

    [Fact]
    public void DotEnv_reads_legacy_node_file()
    {
        var path = Path.Combine(_dir, ".env");
        File.WriteAllText(path, "API_URL=https://api.integration.seedz.ag/integration/v1/\nCLIENT_ID=abc\nCLIENT_SECRET=def\n# comment\nexport FOO='bar'\n");
        var read = DotEnv.Read(path);
        Assert.Equal("abc", read["CLIENT_ID"]);
        Assert.Equal("bar", read["FOO"]);
    }

    [Fact]
    public void Environment_requires_credentials_unless_configuring()
    {
        var paths = new AgentPaths(_dir);
        Assert.Throws<EnvironmentValidationException>(() => new AgentEnvironment(paths));

        var env = new AgentEnvironment(paths, skipCredentialValidation: true);
        Assert.Equal(300_000, env.ApiRequestTimeout);
        Assert.Equal(500, env.ChunkSize);
        Assert.Equal(3, env.Retries);
    }

    [Fact]
    public void Environment_env_file_overrides_cli_and_normalizes_url()
    {
        var paths = new AgentPaths(_dir);
        File.WriteAllText(paths.EnvFile, "API_URL=https://api.example.com/v1\nCLIENT_ID=id\nCLIENT_SECRET=secret\nCHUNK_SIZE=50\n");
        var env = new AgentEnvironment(paths);
        env.Merge(new Dictionary<string, string?> { ["chunk-size"] = "999", ["use-console-log"] = "true", ["extract-last-n-days"] = "4" });

        Assert.Equal("https://api.example.com/v1/", env.ApiUrl);
        Assert.Equal(50, env.ChunkSize);            // .env wins (dotenv override:true)
        Assert.True(env.UseConsoleLog);             // CLI merge for keys not in .env
        Assert.Equal(4, env.ExtractLastNDays);
        Assert.False(env.IsRedirected);
    }

    [Fact]
    public void Environment_rejects_unknown_env_value()
    {
        var paths = new AgentPaths(_dir);
        File.WriteAllText(paths.EnvFile, "API_URL=https://a/\nCLIENT_ID=i\nCLIENT_SECRET=s\nENV=XYZ\n");
        Assert.Throws<EnvironmentValidationException>(() => new AgentEnvironment(paths));
    }

    [Fact]
    public void Discovery_redirects_credentials_when_env_is_set()
    {
        var paths = new AgentPaths(_dir);
        File.WriteAllText(paths.EnvFile, "API_URL=https://prd/\nCLIENT_ID=prd-id\nCLIENT_SECRET=prd-secret\nENV=SND\n");
        var env = new AgentEnvironment(paths);
        env.SetDiscovery(new Sdz.Agent.Api.Discovery
        {
            Snd = new Sdz.Agent.Api.DiscoveryBody
            {
                ApiUrl = "https://snd/",
                Credentials = new Sdz.Agent.Api.DiscoveryCredentials { ClientId = "snd-id", ClientSecret = "snd-secret" },
            },
        });
        Assert.Equal("https://snd/", env.ApiUrl);
        Assert.Equal("snd-id", env.ClientId);
        Assert.Equal("prd-id", env.BaseClientId);
        Assert.True(env.IsRedirected);
    }
}
