using Sdz.Agent.Api;

namespace Sdz.Agent.Core;

public sealed class EnvironmentValidationException(string message) : Exception(message);

/// <summary>
/// Port of EnvironmentService: layered configuration made of the process
/// environment, CLI overrides (mergeEnv), the .env file (which overrides both,
/// like dotenv's override:true) and, when ENV is set, the credentials returned
/// by the discovery endpoint.
/// </summary>
public sealed class AgentEnvironment
{
    private readonly AgentPaths _paths;
    private readonly Dictionary<string, string> _overrides = new(StringComparer.OrdinalIgnoreCase);
    private Dictionary<string, string> _values = new(StringComparer.OrdinalIgnoreCase);
    private Discovery? _discovery;

    public bool SkipCredentialValidation { get; set; }

    public AgentEnvironment(AgentPaths paths, bool skipCredentialValidation = false)
    {
        _paths = paths;
        SkipCredentialValidation = skipCredentialValidation;
        Parse();
    }

    // ---- typed accessors (names mirror the Node agent's zod schema) ----
    public string ApiUrl => Normalize(Get("API_URL"));
    public string ClientId => Get("CLIENT_ID");
    public string ClientSecret => Get("CLIENT_SECRET");
    public int ApiRequestTimeout => GetInt("API_REQUEST_TIMEOUT", 300_000);
    public string? AmazonAccessKey => GetOrNull("AMAZON_ACCESS_KEY");
    public string? AmazonAccessSecretKey => GetOrNull("AMAZON_ACCESS_SECRET_KEY");
    public string? AmazonRegion => GetOrNull("AMAZON_REGION");
    public int ChunkSize => GetInt("CHUNK_SIZE", 500);
    public string? Env => GetOrNull("ENV")?.ToUpperInvariant();
    public int ExtractLastNDays => GetInt("EXTRACT_LAST_N_DAYS", 0);
    public bool Forever => GetBool("FOREVER");
    public string? Query => GetOrNull("QUERY");
    public int Retries => GetInt("RETRIES", 3);
    public bool RawOnly => GetBool("RAW_ONLY");
    public string? Schema => GetOrNull("SCHEMA");
    public int Throttle => GetInt("THROTTLE", 0);
    public string? Type => GetOrNull("TYPE");
    public bool UseConsoleLog => GetBool("USE_CONSOLE_LOG");
    public bool Verbose => GetBool("VERBOSE");
    public bool Listen => GetBool("LISTEN");

    /// <summary>
    /// Minutes without an effective command before a console `listen` session shuts down
    /// (--session-ttl). Null = no limit, which is how every installed agent behaves. Garbage-tolerant
    /// on purpose: a non-numeric, zero or negative SESSION_TTL means "no limit" instead of failing.
    /// </summary>
    public double? SessionTtlMinutes =>
        double.TryParse(GetOrNull("SESSION_TTL"), System.Globalization.NumberStyles.Float, System.Globalization.CultureInfo.InvariantCulture, out var m)
        && m > 0 && double.IsFinite(m) ? m : null;
    public bool TelemetryEnabled => !string.Equals(GetOrNull("TELEMETRY")?.Trim(), "off", StringComparison.OrdinalIgnoreCase);

    /// <summary>Base credentials, before any discovery override. Logs always use these.</summary>
    public string BaseApiUrl => Normalize(_values.GetValueOrDefault("API_URL") ?? "");
    public string BaseClientId => _values.GetValueOrDefault("CLIENT_ID") ?? "";
    public string BaseClientSecret => _values.GetValueOrDefault("CLIENT_SECRET") ?? "";

    /// <summary>True when discovery redirected the agent to another environment (e.g. SND).</summary>
    public bool IsRedirected => !string.Equals(BaseClientId, ClientId, StringComparison.Ordinal);

    public void SetDiscovery(Discovery discovery)
    {
        _discovery = discovery;
        Parse();
    }

    /// <summary>Port of UtilsService.mergeEnv: CLI args become upper-snake-case variables.</summary>
    public void Merge(IEnumerable<KeyValuePair<string, string?>> args)
    {
        foreach (var (key, value) in args)
        {
            if (key is "_" or "$0" || value is null) continue;
            var normalized = key.ToUpperInvariant().Replace('-', '_');
            _overrides[normalized] = value;
        }
        Parse();
    }

    public void Set(string key, string value)
    {
        _overrides[key.ToUpperInvariant().Replace('-', '_')] = value;
        Parse();
    }

    public string? GetOrNull(string key)
    {
        var rawEnv = _values.TryGetValue("ENV", out var e) && e.Length > 0 ? e.ToUpperInvariant() : null;
        if (_discovery is not null && rawEnv is not null && _discovery.TryGet(rawEnv, out var body))
        {
            switch (key.ToUpperInvariant())
            {
                case "API_URL": return body.ApiUrl;
                case "CLIENT_ID": return body.Credentials?.ClientId;
                case "CLIENT_SECRET": return body.Credentials?.ClientSecret;
            }
        }
        return _values.TryGetValue(key, out var value) && value.Length > 0 ? value : null;
    }

    public string Get(string key) => GetOrNull(key) ?? "";

    public int GetInt(string key, int fallback)
    {
        // Number(value) || fallback
        var raw = GetOrNull(key);
        return int.TryParse(raw, out var n) && n != 0 ? n : fallback;
    }

    public bool GetBool(string key)
    {
        var raw = GetOrNull(key);
        return raw is not null && (raw.Equals("true", StringComparison.OrdinalIgnoreCase) || raw == "1");
    }

    /// <summary>Re-reads the .env and validates required values (zod schema port).</summary>
    public void Parse()
    {
        var merged = new Dictionary<string, string>(StringComparer.OrdinalIgnoreCase);

        foreach (System.Collections.DictionaryEntry entry in Environment.GetEnvironmentVariables())
        {
            if (entry.Key is string k && entry.Value is string v) merged[k] = v;
        }

        foreach (var (k, v) in _overrides) merged[k] = v;

        // dotenv with override:true -> the file wins
        foreach (var (k, v) in DotEnv.Read(_paths.EnvFile)) merged[k] = v;

        _values = merged;
        Validate();
    }

    private void Validate()
    {
        var errors = new List<string>();

        if (!SkipCredentialValidation)
        {
            var apiUrl = GetOrNull("API_URL");
            if (apiUrl is null || !Uri.TryCreate(apiUrl, UriKind.Absolute, out _)) errors.Add("API_URL: Invalid url");
            if (GetOrNull("CLIENT_ID") is null) errors.Add("CLIENT_ID: Required");
            if (GetOrNull("CLIENT_SECRET") is null) errors.Add("CLIENT_SECRET: Required");
        }

        var env = GetOrNull("ENV");
        if (env is not null && env.ToUpperInvariant() is not ("DEV" or "SND" or "PRD"))
        {
            errors.Add("ENV: Invalid enum value. Expected 'DEV' | 'SND' | 'PRD'");
        }

        if (errors.Count > 0)
        {
            throw new EnvironmentValidationException(
                $"INVALID CONFIGURATION ({_paths.EnvFile}): {string.Join("; ", errors)}");
        }
    }

    private static string Normalize(string url) => url.Length == 0 || url.EndsWith('/') ? url : url + "/";
}
