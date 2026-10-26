using Sdz.Agent.Commands;
using Sdz.Agent.Core;
using Xunit;

namespace Sdz.Agent.Tests.Core;

public class IdleTimerTests
{
    [Theory]
    [InlineData("Ping", false)]
    [InlineData("ListActiveClients", false)]
    [InlineData("Response", false)]
    [InlineData("", false)]
    [InlineData(null, false)]
    [InlineData("Query", true)]
    [InlineData("Execute", true)]
    [InlineData("Shell", true)]
    [InlineData("Update", true)]
    public void Only_effective_commands_are_activity(string? command, bool expected) =>
        Assert.Equal(expected, IdleTimer.IsActivity(command));

    [Fact]
    public async Task Expires_after_ttl_without_activity()
    {
        var expired = new TaskCompletionSource<TimeSpan>();
        using var t = new IdleTimer(TimeSpan.FromMilliseconds(150), d => expired.TrySetResult(d)).Start();
        var done = await Task.WhenAny(expired.Task, Task.Delay(3000));
        Assert.Same(expired.Task, done);
    }

    [Fact]
    public async Task Pings_do_not_postpone_but_commands_do()
    {
        var fired = 0;
        using var t = new IdleTimer(TimeSpan.FromMilliseconds(400), _ => Interlocked.Increment(ref fired)).Start();
        // pings every 100 ms for longer than the TTL: must still expire
        for (var i = 0; i < 6; i++) { Assert.False(t.Touch("Ping")); await Task.Delay(100); }
        Assert.Equal(1, Volatile.Read(ref fired));

        var fired2 = 0;
        using var t2 = new IdleTimer(TimeSpan.FromMilliseconds(400), _ => Interlocked.Increment(ref fired2)).Start();
        // an effective command every 200 ms keeps the session alive
        for (var i = 0; i < 5; i++) { Assert.True(t2.Touch("Query")); await Task.Delay(200); }
        Assert.Equal(0, Volatile.Read(ref fired2));
    }

    [Fact]
    public async Task Stop_prevents_expiry()
    {
        var fired = false;
        var t = new IdleTimer(TimeSpan.FromMilliseconds(100), _ => fired = true).Start();
        t.Stop();
        await Task.Delay(300);
        Assert.False(fired);
        Assert.False(t.Touch("Query"));
    }

    [Theory]
    [InlineData("30", 30d)]
    [InlineData("0.5", 0.5d)]
    [InlineData("0", null)]
    [InlineData("-5", null)]
    [InlineData("abc", null)]
    [InlineData("", null)]
    public void Session_ttl_is_garbage_tolerant(string raw, double? expected)
    {
        var dir = Path.Combine(Path.GetTempPath(), "sdz-ttl-" + Guid.NewGuid().ToString("N"));
        Directory.CreateDirectory(dir);
        try
        {
            var env = new AgentEnvironment(new AgentPaths(dir), skipCredentialValidation: true);
            env.Merge(new Dictionary<string, string?> { ["session-ttl"] = raw });
            Assert.Equal(expected, env.SessionTtlMinutes);
        }
        finally { Directory.Delete(dir, true); }
    }
}
