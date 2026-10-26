using System.Diagnostics;
using System.Runtime.InteropServices;
using System.Security.Cryptography;
using System.Text;
using System.Text.Json.Serialization;
using Sdz.Agent.Core;
using Sdz.Agent.Core.Logging;

namespace Sdz.Agent.Update;

public sealed class UpdatePackage
{
    [JsonPropertyName("url")] public string Url { get; set; } = "";
    [JsonPropertyName("sha256")] public string Sha256 { get; set; } = "";
}

public sealed class UpdateManifest
{
    [JsonPropertyName("version")] public string Version { get; set; } = "";
    [JsonPropertyName("channel")] public string Channel { get; set; } = "stable";
    [JsonPropertyName("publishedAt")] public string? PublishedAt { get; set; }
    [JsonPropertyName("packages")] public Dictionary<string, UpdatePackage> Packages { get; set; } = new();
    /// <summary>Optional base64 ECDSA-P256/SHA256 signature over the canonical "packages" JSON.</summary>
    [JsonPropertyName("signature")] public string? Signature { get; set; }
}

public sealed class UpdateState
{
    public string? PreviousPackage { get; set; }
    public string? PreviousVersion { get; set; }
    public string? TargetVersion { get; set; }
    public string? InstalledAt { get; set; }
    public bool Healthy { get; set; }
    public int StartFailures { get; set; }
}

/// <summary>
/// Self-update: reads a signed manifest, downloads the native package for this
/// platform, verifies its SHA-256 and hands it to the OS installer in a detached
/// process (msiexec / apt|dpkg|rpm / installer). The package of the version being
/// replaced is kept so the host can roll back if the new version never becomes healthy.
/// </summary>
public sealed class UpdateService
{
    public const string ManifestUrlVariable = "SDZ_AGENT_UPDATE_URL";
    public const string PublicKeyVariable = "SDZ_AGENT_UPDATE_PUBKEY";
    public const string AutoUpdateVariable = "SDZ_AGENT_AUTO_UPDATE";
    public const string DefaultManifestUrl = "https://github.com/seedz-ag/sdz-agent-dotnet/releases/latest/download/manifest.json";

    private readonly AgentEnvironment _env;
    private readonly AgentPaths _paths;
    private readonly Logger _logger;
    private readonly HttpClient _http = new() { Timeout = TimeSpan.FromMinutes(10) };

    public UpdateService(AgentEnvironment env, AgentPaths paths, Logger logger)
    {
        _env = env;
        _paths = paths;
        _logger = logger;
        _http.DefaultRequestHeaders.UserAgent.ParseAdd($"sdz-agent/{Utils.Version}");
    }

    public string ManifestUrl => _env.GetOrNull(ManifestUrlVariable) ?? DefaultManifestUrl;
    public bool AutoUpdateEnabled => !string.Equals(_env.GetOrNull(AutoUpdateVariable), "false", StringComparison.OrdinalIgnoreCase);
    private string StatePath => Path.Combine(_paths.UpdatesDir, "state.json");

    public static string PackageKey()
    {
        var arch = RuntimeInformation.OSArchitecture switch
        {
            Architecture.Arm64 => "arm64",
            _ => "x64",
        };
        if (OperatingSystem.IsWindows()) return $"win-{arch}";
        if (OperatingSystem.IsMacOS()) return $"osx-{arch}";
        var format = File.Exists("/usr/bin/dpkg") || File.Exists("/bin/dpkg") ? "deb" : "rpm";
        return $"linux-{arch}-{format}";
    }

    /// <summary>Starts the downloaded installer (substitutable in tests).</summary>
    public Action<string>? Launch { get; set; }

    public bool HasPublicKey => !string.IsNullOrWhiteSpace(_env.GetOrNull(PublicKeyVariable) ?? EmbeddedPublicKey);

    public async Task<UpdateManifest?> FetchManifestAsync(CancellationToken ct = default) => await FetchManifestAsync(ManifestUrl, ct).ConfigureAwait(false);

    public async Task<UpdateManifest?> FetchManifestAsync(string manifestUrl, CancellationToken ct = default)
    {
        var json = await _http.GetStringAsync(manifestUrl, ct).ConfigureAwait(false);
        var manifest = Json.Deserialize<UpdateManifest>(json);
        if (manifest is null) return null;
        VerifySignature(json, manifest);
        return manifest;
    }

    public static bool IsNewer(string candidate, string current) =>
        Version.TryParse(Normalize(candidate), out var c) && Version.TryParse(Normalize(current), out var cur) && c > cur;

    private static string Normalize(string v)
    {
        v = v.TrimStart('v', 'V');
        var dash = v.IndexOfAny(new[] { '-', '+' });
        return dash > 0 ? v[..dash] : v;
    }

    /// <summary>Returns the new version when an update was launched, null when already up to date.</summary>
    public async Task<string?> CheckAndApplyAsync(bool apply, CancellationToken ct = default)
    {
        var manifest = await FetchManifestAsync(ct).ConfigureAwait(false);
        if (manifest is null)
        {
            _logger.Warn("UPDATE MANIFEST NOT AVAILABLE");
            return null;
        }

        if (!IsNewer(manifest.Version, Utils.Version))
        {
            _logger.Info($"AGENT IS UP TO DATE ({Utils.Version})");
            return null;
        }

        var key = PackageKey();
        if (!manifest.Packages.TryGetValue(key, out var package))
        {
            _logger.Warn($"NO PACKAGE FOR {key} IN VERSION {manifest.Version}");
            return null;
        }

        _logger.Info($"UPDATE AVAILABLE: {Utils.Version} -> {manifest.Version} ({key})");
        if (!apply) return manifest.Version;

        var file = await DownloadAsync(package, manifest.Version, key, ct).ConfigureAwait(false);
        SaveState(new UpdateState
        {
            PreviousPackage = LoadState()?.TargetVersion == Utils.Version ? CurrentPackagePath(key) : null,
            PreviousVersion = Utils.Version,
            TargetVersion = manifest.Version,
            InstalledAt = DateTime.UtcNow.ToString("o"),
            Healthy = false,
            StartFailures = 0,
        });
        KeepCurrentPackage(file, key);
        LaunchInstaller(file);
        return manifest.Version;
    }

    /// <summary>Called by the host once the running version authenticated successfully.</summary>
    public void MarkHealthy()
    {
        var state = LoadState();
        if (state is null) return;
        if (state.TargetVersion == Utils.Version && !state.Healthy)
        {
            state.Healthy = true;
            state.StartFailures = 0;
            SaveState(state);
            _logger.Info($"UPDATE TO {Utils.Version} CONFIRMED HEALTHY");
        }
    }

    /// <summary>Called by the host when startup failed; after 3 failures the previous package is reinstalled.</summary>
    public bool RegisterStartFailure()
    {
        var state = LoadState();
        if (state is null || state.Healthy || state.TargetVersion != Utils.Version) return false;

        state.StartFailures++;
        SaveState(state);
        if (state.StartFailures < 3 || string.IsNullOrEmpty(state.PreviousPackage) || !File.Exists(state.PreviousPackage)) return false;

        _logger.Error($"VERSION {Utils.Version} FAILED TO START {state.StartFailures} TIMES, ROLLING BACK TO {state.PreviousVersion}");
        state.TargetVersion = state.PreviousVersion;
        state.Healthy = true;
        SaveState(state);
        LaunchInstaller(state.PreviousPackage);
        return true;
    }

    private async Task<string> DownloadAsync(UpdatePackage package, string version, string key, CancellationToken ct)
    {
        Directory.CreateDirectory(_paths.UpdatesDir);
        var extension = Path.GetExtension(new Uri(package.Url).AbsolutePath);
        var file = Path.Combine(_paths.UpdatesDir, $"sdz-agent-{version}-{key}{extension}");

        _logger.Info($"DOWNLOADING {package.Url}");
        await using (var source = await _http.GetStreamAsync(package.Url, ct).ConfigureAwait(false))
        await using (var target = File.Create(file))
        {
            await source.CopyToAsync(target, ct).ConfigureAwait(false);
        }

        var hash = Convert.ToHexString(SHA256.HashData(await File.ReadAllBytesAsync(file, ct).ConfigureAwait(false))).ToLowerInvariant();
        if (!string.Equals(hash, package.Sha256.Trim().ToLowerInvariant(), StringComparison.Ordinal))
        {
            File.Delete(file);
            throw new InvalidOperationException($"SHA256 MISMATCH FOR {file}: expected {package.Sha256}, got {hash}");
        }
        _logger.Info($"PACKAGE VERIFIED {file}");
        return file;
    }

    private string CurrentPackagePath(string key) => Path.Combine(_paths.UpdatesDir, $"current-{key}");

    private void KeepCurrentPackage(string newFile, string key)
    {
        // the file being installed becomes "current" after the install; keep the one before it as previous
        try
        {
            var current = CurrentPackagePath(key) + Path.GetExtension(newFile);
            if (File.Exists(current))
            {
                var previous = Path.Combine(_paths.UpdatesDir, $"previous-{key}{Path.GetExtension(newFile)}");
                File.Copy(current, previous, overwrite: true);
                var state = LoadState();
                if (state is not null) { state.PreviousPackage = previous; SaveState(state); }
            }
            File.Copy(newFile, current, overwrite: true);
        }
        catch (Exception e)
        {
            _logger.Warn("COULD NOT KEEP PACKAGE FOR ROLLBACK", e.Message);
        }
    }

    private void LaunchInstaller(string file)
    {
        var log = Path.Combine(_paths.UpdatesDir, "install.log");
        ProcessStartInfo psi;

        if (OperatingSystem.IsWindows() && file.EndsWith(".exe", StringComparison.OrdinalIgnoreCase))
        {
            // NSIS setup: silent, into the current install folder (where .env, output\ and logs\ live).
            // /D= must be the last argument and must not be quoted, even with spaces.
            psi = new ProcessStartInfo(file, $"/S /D={_paths.AppDir.TrimEnd('\\', '/')}");
        }
        else if (OperatingSystem.IsWindows())
        {
            psi = new ProcessStartInfo("msiexec.exe", $"/i \"{file}\" /qn /norestart /l*v \"{log}\"");
        }
        else if (OperatingSystem.IsMacOS())
        {
            psi = new ProcessStartInfo("/bin/sh", $"-c \"sleep 2; /usr/sbin/installer -pkg '{file}' -target / > '{log}' 2>&1\"");
        }
        else
        {
            var install = file.EndsWith(".deb", StringComparison.OrdinalIgnoreCase)
                ? $"(apt-get install -y '{file}' || dpkg -i '{file}')"
                : $"(dnf install -y '{file}' || yum install -y '{file}' || rpm -Uvh '{file}')";
            var script = $"sleep 2; {install} > '{log}' 2>&1";
            psi = File.Exists("/usr/bin/systemd-run")
                ? new ProcessStartInfo("/usr/bin/systemd-run", $"--unit=sdz-agent-update-{DateTime.UtcNow:HHmmss} --collect /bin/sh -c \"{script}\"")
                : new ProcessStartInfo("/usr/bin/setsid", $"/bin/sh -c \"nohup sh -c \\\"{script}\\\" >/dev/null 2>&1 &\"");
        }

        psi.UseShellExecute = false;
        psi.CreateNoWindow = true;
        _logger.Info($"LAUNCHING INSTALLER: {psi.FileName} {psi.Arguments}");
        Process.Start(psi);
    }

    private void VerifySignature(string manifestJson, UpdateManifest manifest)
    {
        var publicKey = _env.GetOrNull(PublicKeyVariable) ?? EmbeddedPublicKey;
        if (string.IsNullOrWhiteSpace(publicKey)) return; // signature verification disabled

        if (string.IsNullOrWhiteSpace(manifest.Signature))
            throw new InvalidOperationException("UPDATE MANIFEST IS NOT SIGNED");

        using var ecdsa = ECDsa.Create();
        ecdsa.ImportFromPem(publicKey);
        var packages = Json.Parse(manifestJson)?["packages"]?.ToJsonString() ?? "";
        var ok = ecdsa.VerifyData(Encoding.UTF8.GetBytes(packages), Convert.FromBase64String(manifest.Signature), HashAlgorithmName.SHA256);
        if (!ok) throw new InvalidOperationException("UPDATE MANIFEST SIGNATURE IS INVALID");
    }

    /// <summary>PEM public key used to verify manifests. Empty = verification disabled (SHA-256 only).</summary>
    public const string EmbeddedPublicKey = "";

    private UpdateState? LoadState()
    {
        try { return File.Exists(StatePath) ? Json.Deserialize<UpdateState>(File.ReadAllText(StatePath)) : null; }
        catch { return null; }
    }

    private void SaveState(UpdateState state)
    {
        try
        {
            Directory.CreateDirectory(_paths.UpdatesDir);
            File.WriteAllText(StatePath, Json.Serialize(state, indented: true));
        }
        catch { }
    }

    // ---------------------------------------------------------------- remote "Update" command

    private static readonly SemaphoreSlim Updating = new(1, 1);

    /// <summary>
    /// Resolves the manifest, decides and (unless CheckOnly) downloads and verifies the package.
    /// Returns the answer for the caller and, when an install is due, the action that launches the
    /// installer: the caller answers first, then launches (the installer stops this service).
    /// </summary>
    public async Task<(UpdateResult Result, Action? Launch)> PrepareAsync(UpdateOptions o, CancellationToken ct = default)
    {
        var res = new UpdateResult { Current = Utils.Version };
        if (!await Updating.WaitAsync(0, ct).ConfigureAwait(false))
        {
            res.Status = "rejected"; res.Message = "an update is already in progress";
            return (res, null);
        }
        var keepLock = false;
        try
        {
            var manifestUrl = ManifestUrl;
            if (!string.IsNullOrWhiteSpace(o.ManifestUrl) && o.ManifestUrl != manifestUrl)
            {
                if (!HasPublicKey)
                {
                    res.Status = "rejected"; res.Message = $"manifestUrl override requires signed manifests ({PublicKeyVariable})";
                    return (res, null);
                }
                manifestUrl = o.ManifestUrl;
            }

            UpdateManifest? manifest;
            try { manifest = await FetchManifestAsync(manifestUrl, ct).ConfigureAwait(false); }
            catch (Exception e) { res.Status = "error"; res.Message = $"manifest {manifestUrl}: {e.Message}"; return (res, null); }
            if (manifest is null) { res.Status = "error"; res.Message = $"manifest {manifestUrl}: empty"; return (res, null); }

            res.Target = manifest.Version;
            if (!string.IsNullOrWhiteSpace(o.Version) && Normalize(o.Version) != Normalize(manifest.Version))
            {
                res.Status = "rejected"; res.Message = $"manifest offers {manifest.Version}, {o.Version} was requested";
                return (res, null);
            }
            if (!IsNewer(manifest.Version, Utils.Version) && !o.Force)
            {
                res.Status = "up-to-date"; res.Message = "no newer version in the manifest";
                return (res, null);
            }
            var key = PackageKey();
            if (!manifest.Packages.TryGetValue(key, out var package))
            {
                res.Status = "error"; res.Message = $"no package for {key}";
                return (res, null);
            }
            if (o.CheckOnly)
            {
                res.Status = "available"; res.Message = $"package {key}";
                return (res, null);
            }

            string file;
            try { file = await DownloadAsync(package, manifest.Version, key, ct).ConfigureAwait(false); }
            catch (Exception e) { res.Status = "error"; res.Message = $"download: {e.Message}"; return (res, null); }

            SaveState(new UpdateState
            {
                PreviousPackage = LoadState()?.TargetVersion == Utils.Version ? CurrentPackagePath(key) : null,
                PreviousVersion = Utils.Version,
                TargetVersion = manifest.Version,
                InstalledAt = DateTime.UtcNow.ToString("o"),
                Healthy = false,
                StartFailures = 0,
            });
            KeepCurrentPackage(file, key);
            res.Status = "updating"; res.Message = "package verified, installer starting; the service restarts with the new version";
            keepLock = true;
            return (res, () =>
            {
                try
                {
                    _logger.Info($"LAUNCHING INSTALLER {file}");
                    (Launch ?? LaunchInstaller)(file);
                }
                finally { Updating.Release(); }
            });
        }
        finally
        {
            if (!keepLock) Updating.Release();
        }
    }
}

/// <summary>Options of an on-demand update (remote "Update" command).</summary>
public sealed record UpdateOptions
{
    /// <summary>Replaces the configured manifest; only honoured when signatures are verified (public key set).</summary>
    [JsonPropertyName("manifestUrl"), JsonIgnore(Condition = JsonIgnoreCondition.WhenWritingNull)] public string? ManifestUrl { get; init; }
    /// <summary>Expected version: the update is refused when the manifest offers another one.</summary>
    [JsonPropertyName("version"), JsonIgnore(Condition = JsonIgnoreCondition.WhenWritingNull)] public string? Version { get; init; }
    /// <summary>Installs even when not newer (reinstall/downgrade) and even during an extraction.</summary>
    [JsonPropertyName("force"), JsonIgnore(Condition = JsonIgnoreCondition.WhenWritingDefault)] public bool Force { get; init; }
    /// <summary>Only reports what would happen.</summary>
    [JsonPropertyName("check"), JsonIgnore(Condition = JsonIgnoreCondition.WhenWritingDefault)] public bool CheckOnly { get; init; }

    /// <summary>[] | ["check"] | ["force"] | ["3.1.0"] | [{"version":"3.1.0","force":true,"check":false,"manifestUrl":"..."}]</summary>
    public static UpdateOptions Parse(System.Text.Json.Nodes.JsonArray? args)
    {
        var o = new UpdateOptions();
        foreach (var node in args ?? new System.Text.Json.Nodes.JsonArray())
        {
            if (node is System.Text.Json.Nodes.JsonValue v && v.TryGetValue<string>(out var s))
            {
                switch (s.Trim().ToLowerInvariant())
                {
                    case "" or "update" or "apply": break;
                    case "check": o = o with { CheckOnly = true }; break;
                    case "force": o = o with { Force = true }; break;
                    default: o = o with { Version = s.Trim() }; break;
                }
            }
            else if (node is System.Text.Json.Nodes.JsonObject obj)
            {
                if (obj["version"]?.ToString() is { Length: > 0 } ver) o = o with { Version = ver.Trim() };
                if (obj["manifestUrl"]?.ToString() is { Length: > 0 } url) o = o with { ManifestUrl = url.Trim() };
                if (Truthy(obj["force"])) o = o with { Force = true };
                if (Truthy(obj["check"])) o = o with { CheckOnly = true };
            }
        }
        return o;
    }

    private static bool Truthy(System.Text.Json.Nodes.JsonNode? n) => n?.ToString().Trim().ToLowerInvariant() is "true" or "1";
}

/// <summary>Answer sent back to the sender of a remote "Update".</summary>
public sealed class UpdateResult
{
    [JsonPropertyName("status")] public string Status { get; set; } = ""; // up-to-date | available | updating | rejected | error
    [JsonPropertyName("current")] public string Current { get; set; } = "";
    [JsonPropertyName("target"), JsonIgnore(Condition = JsonIgnoreCondition.WhenWritingNull)] public string? Target { get; set; }
    [JsonPropertyName("message"), JsonIgnore(Condition = JsonIgnoreCondition.WhenWritingNull)] public string? Message { get; set; }
}
