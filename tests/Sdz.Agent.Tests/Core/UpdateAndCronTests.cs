using Sdz.Agent.Commands;
using Sdz.Agent.Update;
using Xunit;

namespace Sdz.Agent.Tests.Core;

public class UpdateAndCronTests
{
    [Theory]
    [InlineData("3.0.1", "3.0.0", true)]
    [InlineData("v3.1.0", "3.0.9", true)]
    [InlineData("3.0.0", "3.0.0", false)]
    [InlineData("2.9.9", "3.0.0", false)]
    [InlineData("3.0.0-beta.1", "3.0.0", false)]
    public void Version_comparison(string candidate, string current, bool expected) =>
        Assert.Equal(expected, UpdateService.IsNewer(candidate, current));

    [Fact]
    public void Package_key_matches_platform_naming()
    {
        var key = UpdateService.PackageKey();
        Assert.Matches("^(win|osx|linux)-(x64|arm64)(-(deb|rpm))?$", key);
    }

    [Theory]
    [InlineData("0 6 * * *")]
    [InlineData("*/15 * * * *")]
    [InlineData("0 0 6 * * *")]
    public void Cron_expressions_from_settings_parse(string expression)
    {
        var cron = SchedulerCommand.ParseCron(expression);
        Assert.NotNull(cron);
        Assert.NotNull(cron!.GetNextOccurrence(DateTimeOffset.Now, TimeZoneInfo.Local));
    }

    [Fact]
    public void Invalid_cron_returns_null() => Assert.Null(SchedulerCommand.ParseCron("not a cron"));
}
