using Sdz.Agent.Cli;
using Xunit;

namespace Sdz.Agent.Tests.Core;

public class CommandLineTests
{
    [Fact]
    public void Parses_command_positional_and_options()
    {
        var cli = CommandLine.Parse(new[] { "check", "auth", "--use-console-log", "-n", "5", "--schema=orders", "--no-listen" });
        Assert.Equal("check", cli.Command);
        Assert.Equal("auth", cli.Positional[0]);
        Assert.True(cli.Flag("use-console-log"));
        Assert.Equal("5", cli.Get("extract-last-n-days"));
        Assert.Equal("orders", cli.Get("schema"));
        Assert.False(cli.Flag("listen", true));
    }

    [Fact]
    public void Service_action_is_positional()
    {
        var cli = CommandLine.Parse(new[] { "service", "install" });
        Assert.Equal("service", cli.Command);
        Assert.Equal("install", cli.Positional[0]);
    }

    [Fact]
    public void Configure_flags_are_read()
    {
        var cli = CommandLine.Parse(new[] { "configure", "--client-id", "abc", "--client-secret", "s3cr3t", "--non-interactive" });
        Assert.Equal("abc", cli.Get("client-id"));
        Assert.Equal("s3cr3t", cli.Get("client-secret"));
        Assert.True(cli.Flag("non-interactive"));
    }
}
