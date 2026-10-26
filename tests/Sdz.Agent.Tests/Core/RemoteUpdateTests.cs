using System.Net;
using System.Net.Sockets;
using System.Security.Cryptography;
using System.Text;
using System.Text.Json.Nodes;
using Sdz.Agent.Core;
using Sdz.Agent.Core.Logging;
using Sdz.Agent.Update;
using Xunit;

namespace Sdz.Agent.Tests.Core;

public class RemoteUpdateTests : IDisposable
{
    private readonly string _dir = Path.Combine(Path.GetTempPath(), "sdz-update-tests-" + Guid.NewGuid().ToString("N"));
    private HttpListener? _server;

    public void Dispose()
    {
        try { _server?.Stop(); } catch { }
        try { Directory.Delete(_dir, true); } catch { }
        Environment.SetEnvironmentVariable(UpdateService.ManifestUrlVariable, null);
    }

    [Theory]
    [InlineData("[]", null, false, false, null)]
    [InlineData("[\"check\"]", null, false, true, null)]
    [InlineData("[\"force\"]", null, true, false, null)]
    [InlineData("[\"3.1.0\"]", "3.1.0", false, false, null)]
    [InlineData("[{\"version\":\"3.2.0\",\"force\":true,\"manifestUrl\":\"https://x/m.json\"}]", "3.2.0", true, false, "https://x/m.json")]
    [InlineData("[{\"check\":\"true\"}]", null, false, true, null)]
    public void Parse_reads_strings_and_objects(string json, string? version, bool force, bool check, string? url)
    {
        var o = UpdateOptions.Parse(JsonNode.Parse(json) as JsonArray);
        Assert.Equal(version, o.Version);
        Assert.Equal(force, o.Force);
        Assert.Equal(check, o.CheckOnly);
        Assert.Equal(url, o.ManifestUrl);
    }

    private UpdateService Start(string manifestVersion, List<string> launched)
    {
        var port = ((IPEndPoint)new TcpListener(IPAddress.Loopback, 0) { }.Let(l => { l.Start(); var ep = l.LocalEndpoint; l.Stop(); return ep; })).Port;
        var prefix = $"http://127.0.0.1:{port}/";
        var pkg = Encoding.UTF8.GetBytes("fake installer");
        var sha = Convert.ToHexString(SHA256.HashData(pkg)).ToLowerInvariant();
        _server = new HttpListener();
        _server.Prefixes.Add(prefix);
        _server.Start();
        var server = _server;
        _ = Task.Run(async () =>
        {
            while (server.IsListening)
            {
                HttpListenerContext ctx;
                try { ctx = await server.GetContextAsync(); } catch { return; }
                var body = ctx.Request.Url!.AbsolutePath.EndsWith("manifest.json")
                    ? Encoding.UTF8.GetBytes("{\"version\":\"" + manifestVersion + "\",\"packages\":{\"" + UpdateService.PackageKey() + "\":{\"url\":\"" + prefix + "pkg.bin\",\"sha256\":\"" + sha + "\"}}}")
                    : pkg;
                await ctx.Response.OutputStream.WriteAsync(body);
                ctx.Response.Close();
            }
        });
        Directory.CreateDirectory(_dir);
        Environment.SetEnvironmentVariable(UpdateService.ManifestUrlVariable, prefix + "manifest.json");
        var paths = new AgentPaths(_dir);
        var env = new AgentEnvironment(paths, skipCredentialValidation: true);
        return new UpdateService(env, paths, new Logger()) { Launch = launched.Add };
    }

    [Fact]
    public async Task Prepare_checks_applies_and_guards()
    {
        var launched = new List<string>();
        var s = Start("99.0.0", launched);

        var (check, l0) = await s.PrepareAsync(new UpdateOptions { CheckOnly = true });
        Assert.Equal("available", check.Status);
        Assert.Null(l0);

        var (apply, launch) = await s.PrepareAsync(new UpdateOptions());
        Assert.Equal("updating", apply.Status);
        Assert.Equal("99.0.0", apply.Target);
        Assert.NotNull(launch);

        var (busy, _) = await s.PrepareAsync(new UpdateOptions());
        Assert.Equal("rejected", busy.Status);

        launch!();
        Assert.Single(launched);

        Assert.Equal("rejected", (await s.PrepareAsync(new UpdateOptions { Version = "98.0.0" })).Result.Status);
        Assert.Equal("rejected", (await s.PrepareAsync(new UpdateOptions { ManifestUrl = "https://elsewhere.example/m.json" })).Result.Status);
    }

    [Fact]
    public async Task Prepare_skips_older_unless_forced()
    {
        var launched = new List<string>();
        var s = Start("0.0.1", launched);
        var (r, l) = await s.PrepareAsync(new UpdateOptions());
        Assert.Equal("up-to-date", r.Status);
        Assert.Null(l);
        var (f, lf) = await s.PrepareAsync(new UpdateOptions { Force = true });
        Assert.Equal("updating", f.Status);
        lf!();
        Assert.Single(launched);
    }
}

internal static class LetExtensions
{
    public static TOut Let<TIn, TOut>(this TIn value, Func<TIn, TOut> f) => f(value);
}
