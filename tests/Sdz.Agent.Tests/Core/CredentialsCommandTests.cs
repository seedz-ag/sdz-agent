using Sdz.Agent.Commands;
using Xunit;

namespace Sdz.Agent.Tests.Core;

public class CredentialsCommandTests
{
    [Theory]
    [InlineData(null, "-")]
    [InlineData("", "-")]
    [InlineData("abc", "•••")]
    [InlineData("12345678", "••••••••")]
    [InlineData("abcd1234efgh5678ijkl9012mnop3456qrst7890uvwx1234wxyz", "abcd…wxyz")]
    public void Mask_hides_the_secret_but_keeps_it_recognisable(string? secret, string expected)
    {
        Assert.Equal(expected, CredentialsCommand.Mask(secret));
    }

    [Fact]
    public void Resolve_prefers_cli_then_stdin_then_environment()
    {
        var env = new Dictionary<string, string?>
        {
            [CredentialsCommand.ClientIdVariable] = "env-id",
            [CredentialsCommand.ClientSecretVariable] = "env-secret",
            [CredentialsCommand.ApiUrlVariable] = "https://env/",
        };
        string? GetEnv(string k) => env.GetValueOrDefault(k);

        var fromEnv = CredentialsCommand.Resolve(new CredentialsOptions(), GetEnv, () => null);
        Assert.Equal(("env-id", "env-secret", "https://env/"), fromEnv);

        var fromStdin = CredentialsCommand.Resolve(new CredentialsOptions { ClientId = " cli-id ", SecretFromStdin = true }, GetEnv, () => "stdin-secret\n");
        Assert.Equal(("cli-id", "stdin-secret", "https://env/"), fromStdin);

        var fromCli = CredentialsCommand.Resolve(new CredentialsOptions { ClientId = "a", ClientSecret = "b", ApiUrl = "https://cli/", SecretFromStdin = true }, GetEnv, () => "ignored");
        Assert.Equal(("a", "b", "https://cli/"), fromCli);

        var nothing = CredentialsCommand.Resolve(new CredentialsOptions { SecretFromStdin = true }, _ => null, () => "   ");
        Assert.Equal((null, null, null), nothing);
    }
}
