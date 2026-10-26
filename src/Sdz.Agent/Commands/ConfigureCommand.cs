using Sdz.Agent.Core;
using Sdz.Agent.Core.Http;

namespace Sdz.Agent.Commands;

public sealed class ConfigureOptions
{
    public string? ClientId { get; init; }
    public string? ClientSecret { get; init; }
    public string? ApiUrl { get; init; }
    public bool NonInteractive { get; init; }
    public bool Overwrite { get; init; }
}

/// <summary>
/// Port of ConfigureCommand: asks for (or receives) CLIENT_ID / CLIENT_SECRET,
/// validates them against the auth endpoint and writes the .env in the data dir.
/// </summary>
public sealed class ConfigureCommand
{
    public const string DefaultApiUrl = "https://api.integration.seedz.ag/integration/v1/";

    private readonly HttpClientAdapter _http;
    private readonly AgentPaths _paths;

    public ConfigureCommand(HttpClientAdapter http, AgentPaths paths)
    {
        _http = http;
        _paths = paths;
    }

    public async Task<int> ExecuteAsync(ConfigureOptions options, CancellationToken ct = default)
    {
        var apiUrl = string.IsNullOrWhiteSpace(options.ApiUrl) ? DefaultApiUrl : options.ApiUrl.Trim();
        if (!apiUrl.EndsWith('/')) apiUrl += "/";

        if (File.Exists(_paths.EnvFile) && !options.Overwrite && !options.NonInteractive)
        {
            if (!Confirm("YOUR AGENT SEEMS TO BE CONFIGURED, OVERWRITE? [y/N] "))
            {
                Console.WriteLine("✖ CONFIGURATION CANCELLED.");
                return 1;
            }
        }

        var clientId = options.ClientId;
        var clientSecret = options.ClientSecret;

        while (true)
        {
            if (string.IsNullOrWhiteSpace(clientId) || string.IsNullOrWhiteSpace(clientSecret))
            {
                if (options.NonInteractive)
                {
                    Console.Error.WriteLine("✖ CLIENT ID AND CLIENT SECRET ARE REQUIRED (--client-id / --client-secret).");
                    return 2;
                }
                clientId = Prompt("WHAT'S YOUR CLIENT ID? ");
                clientSecret = PromptSecret("WHAT'S YOUR CLIENT SECRET? ");
            }

            if (await ValidateAsync(apiUrl, clientId!, clientSecret!, ct).ConfigureAwait(false)) break;

            Console.WriteLine("✖ INVALID CREDENTIALS");
            if (options.NonInteractive) return 3;
            clientId = clientSecret = null;
        }

        _paths.EnsureDirectories();
        DotEnv.Write(_paths.EnvFile, new Dictionary<string, string>
        {
            ["API_URL"] = apiUrl,
            ["CLIENT_ID"] = clientId!,
            ["CLIENT_SECRET"] = clientSecret!,
        });

        Console.WriteLine($"✔ CONFIGURATION SAVED. ({_paths.EnvFile})");
        return 0;
    }

    public async Task<bool> ValidateAsync(string apiUrl, string clientId, string clientSecret, CancellationToken ct = default)
    {
        try
        {
            await _http.PostAsync<string>($"{apiUrl}auth", new { clientId, clientSecret },
                new RequestOptions { Timeout = 30_000 }, ct).ConfigureAwait(false);
            return true;
        }
        catch
        {
            return false;
        }
    }

    internal static string Prompt(string message)
    {
        Console.Write(message);
        return Console.ReadLine()?.Trim() ?? "";
    }

    internal static bool Confirm(string message)
    {
        Console.Write(message);
        var answer = Console.ReadLine()?.Trim().ToLowerInvariant();
        return answer is "y" or "yes" or "s" or "sim";
    }

    internal static string PromptSecret(string message)
    {
        Console.Write(message);
        if (Console.IsInputRedirected) return Console.ReadLine()?.Trim() ?? "";

        var secret = new System.Text.StringBuilder();
        while (true)
        {
            var key = Console.ReadKey(intercept: true);
            if (key.Key == ConsoleKey.Enter) { Console.WriteLine(); break; }
            if (key.Key == ConsoleKey.Backspace)
            {
                if (secret.Length > 0) { secret.Length--; Console.Write("\b \b"); }
                continue;
            }
            if (!char.IsControl(key.KeyChar)) { secret.Append(key.KeyChar); Console.Write('*'); }
        }
        return secret.ToString().Trim();
    }
}
