using Sdz.Agent.Control;
using Sdz.Agent.Core;
using Sdz.Agent.Hosting;

namespace Sdz.Agent.Commands;

public sealed class CredentialsOptions
{
    public string? ClientId { get; init; }
    public string? ClientSecret { get; init; }
    public string? ApiUrl { get; init; }
    /// <summary>Read the secret from the first line of stdin (keeps it out of `ps` and the shell history).</summary>
    public bool SecretFromStdin { get; init; }
    public bool NonInteractive { get; init; }
    /// <summary>`show --reveal`: print the full secret instead of the masked form.</summary>
    public bool Reveal { get; init; }
    /// <summary>`clear --yes` / `set --overwrite`: skip the confirmation prompts.</summary>
    public bool Yes { get; init; }
}

/// <summary>
/// `sdz-agent credentials set|show|test|clear`: terminal management of the agent credentials.
/// Talks to the running service through the control channel (same path the tray uses, so the
/// scheduler reloads immediately and no root is needed for members of the sdz-agent group);
/// falls back to the local .env when the service is not running.
/// </summary>
public sealed class CredentialsCommand
{
    public const string ClientIdVariable = "SDZ_CLIENT_ID";
    public const string ClientSecretVariable = "SDZ_CLIENT_SECRET";
    public const string ApiUrlVariable = "SDZ_API_URL";
    public const string Usage = "usage: sdz-agent credentials <set|show|test|clear> [--client-id ID] [--client-secret SECRET | --client-secret-stdin] [--api-url URL] [--non-interactive] [--reveal] [--yes]";

    private readonly ConfigureCommand _configure;
    private readonly AgentPaths _paths;
    private readonly Func<ControlClient> _clientFactory;

    public CredentialsCommand(ConfigureCommand configure, AgentPaths paths)
        : this(configure, paths, () => new ControlClient { Timeout = TimeSpan.FromSeconds(45) }) { }

    public CredentialsCommand(ConfigureCommand configure, AgentPaths paths, Func<ControlClient> clientFactory)
    {
        _configure = configure;
        _paths = paths;
        _clientFactory = clientFactory;
    }

    public Task<int> ExecuteAsync(string? action, CredentialsOptions options, CancellationToken ct = default) =>
        (action ?? "show").ToLowerInvariant() switch
        {
            "set" => SetAsync(options, ct),
            "show" => ShowAsync(options, ct),
            "test" => TestAsync(ct),
            "clear" => ClearAsync(options, ct),
            _ => Task.FromResult(UsageError(action)),
        };

    private static int UsageError(string? action)
    {
        Console.Error.WriteLine($"✖ unknown credentials action '{action}'");
        Console.Error.WriteLine(Usage);
        return 1;
    }

    // ---------------------------------------------------------------- helpers shared with the tests

    /// <summary>`1025…1quh`: enough to recognise a secret without exposing it.</summary>
    public static string Mask(string? secret)
    {
        if (string.IsNullOrEmpty(secret)) return "-";
        if (secret.Length <= 8) return new string('•', secret.Length);
        return $"{secret[..4]}…{secret[^4..]}";
    }

    /// <summary>Resolves the inputs: CLI option, then stdin (secret only), then SDZ_* environment variables.</summary>
    public static (string? ClientId, string? ClientSecret, string? ApiUrl) Resolve(CredentialsOptions o, Func<string, string?> getEnv, Func<string?> readStdinLine)
    {
        var id = Trim(o.ClientId) ?? Trim(getEnv(ClientIdVariable));
        var secret = Trim(o.ClientSecret) ?? (o.SecretFromStdin ? Trim(readStdinLine()) : null) ?? Trim(getEnv(ClientSecretVariable));
        var api = Trim(o.ApiUrl) ?? Trim(getEnv(ApiUrlVariable));
        return (id, secret, api);
    }

    private static string? Trim(string? s) => string.IsNullOrWhiteSpace(s) ? null : s.Trim();

    private static string NormalizeApiUrl(string? apiUrl)
    {
        var url = string.IsNullOrWhiteSpace(apiUrl) ? ConfigureCommand.DefaultApiUrl : apiUrl.Trim();
        return url.EndsWith('/') ? url : url + "/";
    }

    // ---------------------------------------------------------------- set

    private async Task<int> SetAsync(CredentialsOptions o, CancellationToken ct)
    {
        var (clientId, clientSecret, apiUrl) = Resolve(o, Environment.GetEnvironmentVariable, () => Console.ReadLine());
        var local = DotEnv.Read(_paths.EnvFile);
        apiUrl = NormalizeApiUrl(apiUrl ?? (local.TryGetValue("API_URL", out var current) ? current : null));
        if (!Uri.TryCreate(apiUrl, UriKind.Absolute, out _))
        {
            Console.Error.WriteLine("✖ INVALID API URL");
            return 2;
        }

        var interactive = !o.NonInteractive && !Console.IsInputRedirected;
        if (local.ContainsKey("CLIENT_ID") && !o.Yes && interactive && clientId is null)
        {
            if (!ConfigureCommand.Confirm($"YOUR AGENT IS CONFIGURED (client {local["CLIENT_ID"]}), OVERWRITE? [y/N] "))
            {
                Console.WriteLine("✖ CANCELLED.");
                return 1;
            }
        }

        while (true)
        {
            if (clientId is null || clientSecret is null)
            {
                if (!interactive)
                {
                    Console.Error.WriteLine($"✖ CLIENT ID AND CLIENT SECRET ARE REQUIRED (--client-id / --client-secret, --client-secret-stdin or {ClientIdVariable} / {ClientSecretVariable}).");
                    return 2;
                }
                clientId = Trim(ConfigureCommand.Prompt("WHAT'S YOUR CLIENT ID? "));
                clientSecret = Trim(ConfigureCommand.PromptSecret("WHAT'S YOUR CLIENT SECRET? "));
                if (clientId is null || clientSecret is null) continue;
            }

            var applied = await ApplyThroughServiceAsync(clientId, clientSecret, apiUrl, ct).ConfigureAwait(false);
            if (applied is { } response)
            {
                if (response.Ok)
                {
                    Console.WriteLine($"✔ CREDENTIALS SAVED AND APPLIED (client {clientId}, {apiUrl})");
                    Console.WriteLine("  the service reloaded the setting and its schedules; check with `sdz-agent status`.");
                    return 0;
                }
                Console.WriteLine($"✖ {response.Message}");
                if (!interactive) return 3;
                clientId = clientSecret = null;
                continue;
            }

            // service not reachable: validate against the API and write the .env ourselves
            if (!await _configure.ValidateAsync(apiUrl, clientId, clientSecret, ct).ConfigureAwait(false))
            {
                Console.WriteLine("✖ INVALID CREDENTIALS");
                if (!interactive) return 3;
                clientId = clientSecret = null;
                continue;
            }

            try
            {
                _paths.EnsureDirectories();
                DotEnv.Write(_paths.EnvFile, new Dictionary<string, string>
                {
                    ["API_URL"] = apiUrl,
                    ["CLIENT_ID"] = clientId,
                    ["CLIENT_SECRET"] = clientSecret,
                });
            }
            catch (UnauthorizedAccessException)
            {
                Console.Error.WriteLine($"✖ NO PERMISSION TO WRITE {_paths.EnvFile} (run as root/administrator, or start the service and retry)");
                return 4;
            }

            Console.WriteLine($"✔ CREDENTIALS SAVED. ({_paths.EnvFile})");
            Console.WriteLine("  the service is not running; it will load them on its next start (`sdz-agent service restart`).");
            return 0;
        }
    }

    /// <summary>Returns null when the service cannot be reached (then the caller falls back to the local .env).</summary>
    private async Task<ControlResponse?> ApplyThroughServiceAsync(string clientId, string clientSecret, string apiUrl, CancellationToken ct)
    {
        try
        {
            return await _clientFactory().ConfigureAsync(clientId, clientSecret, apiUrl, ct).ConfigureAwait(false);
        }
        catch (Exception) when (!ct.IsCancellationRequested)
        {
            return null;
        }
    }

    // ---------------------------------------------------------------- show

    private async Task<int> ShowAsync(CredentialsOptions o, CancellationToken ct)
    {
        AgentStatus? live = null;
        try
        {
            live = (await _clientFactory().StatusAsync(ct).ConfigureAwait(false)).Status;
        }
        catch (Exception) when (!ct.IsCancellationRequested) { }

        var local = DotEnv.Read(_paths.EnvFile);
        var clientId = live?.ClientId ?? (local.TryGetValue("CLIENT_ID", out var id) ? id : null);
        var secret = live?.ClientSecret ?? (local.TryGetValue("CLIENT_SECRET", out var s) ? s : null);
        var apiUrl = live?.ApiUrl ?? (local.TryGetValue("API_URL", out var a) ? a : null);

        Console.WriteLine($"SDZ Agent credentials");
        Console.WriteLine($"  source:     {(live is not null ? "running service" : "local file")}");
        Console.WriteLine($"  file:       {_paths.EnvFile}{(File.Exists(_paths.EnvFile) ? "" : " (missing)")}");
        if (string.IsNullOrEmpty(clientId) || string.IsNullOrEmpty(secret))
        {
            Console.WriteLine("  configured: no");
            Console.WriteLine("  run `sdz-agent credentials set` to configure.");
            return 1;
        }
        Console.WriteLine("  configured: yes");
        Console.WriteLine($"  client id:  {clientId}");
        Console.WriteLine($"  secret:     {(o.Reveal ? secret : Mask(secret))}{(o.Reveal ? "" : "  (--reveal to show)")}");
        Console.WriteLine($"  api url:    {apiUrl}");
        if (live is not null)
        {
            Console.WriteLine($"  auth:       {(live.AuthOk ? "ok" : "failed / not checked")}");
            Console.WriteLine($"  schedules:  {(live.Schedules.Count == 0 ? "-" : string.Join(" | ", live.Schedules))}");
            Console.WriteLine($"  next run:   {(live.NextRunAt is { } n ? n.ToString("yyyy-MM-dd HH:mm:ss") : "-")}");
        }
        else
        {
            Console.WriteLine("  service:    not reachable (not running, or this user is not in the sdz-agent group)");
        }
        return 0;
    }

    // ---------------------------------------------------------------- test

    private async Task<int> TestAsync(CancellationToken ct)
    {
        var local = DotEnv.Read(_paths.EnvFile);
        string? clientId = local.GetValueOrDefault("CLIENT_ID"), secret = local.GetValueOrDefault("CLIENT_SECRET"), apiUrl = local.GetValueOrDefault("API_URL");
        if (string.IsNullOrEmpty(clientId) || string.IsNullOrEmpty(secret))
        {
            try
            {
                var status = (await _clientFactory().StatusAsync(ct).ConfigureAwait(false)).Status;
                clientId = status?.ClientId; secret = status?.ClientSecret; apiUrl = status?.ApiUrl;
            }
            catch (Exception) when (!ct.IsCancellationRequested) { }
        }
        if (string.IsNullOrEmpty(clientId) || string.IsNullOrEmpty(secret))
        {
            Console.WriteLine("✖ NOT CONFIGURED");
            return 2;
        }

        var ok = await _configure.ValidateAsync(NormalizeApiUrl(apiUrl), clientId, secret, ct).ConfigureAwait(false);
        Console.WriteLine($"          AUTH: {(ok ? "SUCCESS" : "FAIL")}  (client {clientId}, {NormalizeApiUrl(apiUrl)})");
        return ok ? 0 : 1;
    }

    // ---------------------------------------------------------------- clear

    private async Task<int> ClearAsync(CredentialsOptions o, CancellationToken ct)
    {
        if (!o.Yes && !o.NonInteractive && !Console.IsInputRedirected)
        {
            if (!ConfigureCommand.Confirm("REMOVE THE SAVED CREDENTIALS? THE AGENT STOPS EXTRACTING UNTIL NEW ONES ARE SET [y/N] "))
            {
                Console.WriteLine("✖ CANCELLED.");
                return 1;
            }
        }

        try
        {
            var response = await _clientFactory().ClearCredentialsAsync(ct).ConfigureAwait(false);
            if (response.Ok)
            {
                Console.WriteLine("✔ CREDENTIALS REMOVED; the service is idle until `sdz-agent credentials set`.");
                return 0;
            }
            Console.Error.WriteLine($"✖ {response.Message}");
            return 1;
        }
        catch (Exception) when (!ct.IsCancellationRequested) { }

        if (!File.Exists(_paths.EnvFile))
        {
            Console.WriteLine("✔ NOTHING TO REMOVE (not configured).");
            return 0;
        }
        try
        {
            File.Delete(_paths.EnvFile);
        }
        catch (UnauthorizedAccessException)
        {
            Console.Error.WriteLine($"✖ NO PERMISSION TO REMOVE {_paths.EnvFile} (run as root/administrator)");
            return 4;
        }
        Console.WriteLine($"✔ CREDENTIALS REMOVED. ({_paths.EnvFile})");
        Console.WriteLine("  the service is not running; nothing else to do.");
        return 0;
    }
}
