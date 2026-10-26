using Sdz.Agent.Core;
using Sdz.Agent.Telemetry;
using Xunit;

namespace Sdz.Agent.Tests.Telemetry;

public class TelemetryOutboxTests : IDisposable
{
    private readonly string _tmp = Directory.CreateTempSubdirectory("sdz-agent-telemetry-").FullName;
    private readonly TelemetryOutbox _outbox;

    public TelemetryOutboxTests()
    {
        _outbox = new TelemetryOutbox(new AgentPaths(_tmp));
    }

    public void Dispose() => Directory.Delete(_tmp, recursive: true);

    private List<int> Numbers() => _outbox.ReadAll().Select(l => (int)Json.Parse(l)!["n"]!).ToList();

    [Fact]
    public void NoLinesWhenFileMissing() => Assert.Empty(_outbox.ReadAll());

    [Fact]
    public void AppendsJsonLinesAndReadsBack()
    {
        _outbox.Append(new object?[] { new { n = 1 }, new { n = 2 } });
        _outbox.Append(new object?[] { new { n = 3 } });
        Assert.Equal(new[] { 1, 2, 3 }, Numbers());
    }

    [Fact]
    public void RemoveFirstDrainsOnlyFirstN()
    {
        _outbox.Append(new object?[] { new { n = 1 }, new { n = 2 }, new { n = 3 } });
        _outbox.RemoveFirst(2);
        Assert.Equal(new[] { 3 }, Numbers());
    }

    [Fact]
    public void RemoveFirstIsNoOpForNonPositive()
    {
        _outbox.Append(new object?[] { new { n = 1 } });
        _outbox.RemoveFirst(0);
        Assert.Single(_outbox.ReadAll());
    }

    [Fact]
    public void TrimsOldestBeyondCap()
    {
        var total = _outbox.MaxLines + 10;
        _outbox.Append(Enumerable.Range(0, total).Select(i => (object?)new { n = i }).ToList());
        var numbers = Numbers();
        Assert.Equal(_outbox.MaxLines, numbers.Count);
        Assert.Equal(10, numbers[0]);
        Assert.Equal(total - 1, numbers[^1]);
    }
}
