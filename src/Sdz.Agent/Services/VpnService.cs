using System.Diagnostics;
using Sdz.Agent.Api;
using Sdz.Agent.Core;
using Sdz.Agent.Core.Logging;

namespace Sdz.Agent.Services;

/// <summary>
/// Port of VPNService: writes the OpenVPN profile received in the setting to the
/// data directory, starts openvpn and waits for "Initialization Sequence Completed".
/// On Linux/macOS it uses sudo when not running as root (as the Node agent did);
/// on Windows it runs openvpn.exe directly (the service runs as LocalSystem).
/// </summary>
public sealed class VpnService
{
    private readonly AgentPaths _paths;
    private readonly Logger _logger;
    private readonly List<string> _files = new();
    private Process? _process;
    private Security? _security;
    private volatile bool _connected;

    public VpnService(AgentPaths paths, Logger logger)
    {
        _paths = paths;
        _logger = logger;
    }

    public bool IsConnected => _connected;

    public VpnService Configure(Security security)
    {
        _security = security;
        return this;
    }

    public async Task ConnectAsync(CancellationToken ct = default)
    {
        if (_security is null) throw new InvalidOperationException("VPN NOT CONFIGURED");

        var config = Path.Combine(_paths.DataDir, "config.ovpn");
        WriteSecret(config, _security.Config);
        _files.Add(config);

        if (_security.Credentials is { } credentials)
        {
            var userPass = Path.Combine(_paths.DataDir, "user-pass.txt");
            WriteSecret(userPass, $"{credentials.Username}\n{credentials.Password}");
            _files.Add(userPass);
        }

        var (fileName, arguments) = BuildCommand(config);
        _logger.Info($"STARTING VPN: {fileName} {arguments}");

        var psi = new ProcessStartInfo
        {
            FileName = fileName,
            Arguments = arguments,
            WorkingDirectory = _paths.DataDir,
            RedirectStandardOutput = true,
            RedirectStandardError = true,
            UseShellExecute = false,
            CreateNoWindow = true,
        };

        var ready = new TaskCompletionSource<bool>(TaskCreationOptions.RunContinuationsAsynchronously);
        _process = new Process { StartInfo = psi, EnableRaisingEvents = true };
        _process.OutputDataReceived += (_, e) =>
        {
            if (e.Data is null) return;
            _logger.Info(e.Data);
            if (e.Data.Contains("Initialization Sequence Completed"))
            {
                _connected = true;
                ready.TrySetResult(true);
            }
            if (e.Data.Contains("SIGTERM")) _connected = false;
        };
        _process.ErrorDataReceived += (_, e) => { if (e.Data is not null) _logger.Warn(e.Data); };
        _process.Exited += (_, _) => { _connected = false; ready.TrySetResult(false); };

        _process.Start();
        _process.BeginOutputReadLine();
        _process.BeginErrorReadLine();

        var finished = await Task.WhenAny(ready.Task, Task.Delay(TimeSpan.FromSeconds(60), ct)).ConfigureAwait(false);
        if (finished != ready.Task || !ready.Task.Result)
        {
            await DisconnectAsync().ConfigureAwait(false);
            throw new InvalidOperationException("VPN CONNECTION TIMEOUT");
        }

        ClearFiles();
    }

    public async Task DisconnectAsync()
    {
        try
        {
            if (_process is { HasExited: false })
            {
                _process.Kill(entireProcessTree: true);
                await _process.WaitForExitAsync().ConfigureAwait(false);
            }
        }
        catch (Exception ex)
        {
            _logger.Warn("VPN DISCONNECT ERROR", ex.Message);
        }
        finally
        {
            _connected = false;
            ClearFiles();
        }
    }

    private (string FileName, string Arguments) BuildCommand(string config)
    {
        if (OperatingSystem.IsWindows())
        {
            var candidates = new[]
            {
                Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.ProgramFiles), "OpenVPN", "bin", "openvpn.exe"),
                "openvpn.exe",
            };
            var exe = candidates.FirstOrDefault(File.Exists) ?? "openvpn.exe";
            return (exe, $"--config \"{config}\"");
        }

        return Environment.UserName == "root"
            ? ("openvpn", $"--config \"{config}\"")
            : ("sudo", $"-- sh -c \"openvpn --config '{config}'\"");
    }

    private static void WriteSecret(string path, string content)
    {
        File.WriteAllText(path, content);
        if (!OperatingSystem.IsWindows())
        {
            try { File.SetUnixFileMode(path, UnixFileMode.UserRead | UnixFileMode.UserWrite); } catch { }
        }
    }

    private void ClearFiles()
    {
        foreach (var file in _files)
        {
            try { if (File.Exists(file)) File.Delete(file); } catch { }
        }
        _files.Clear();
    }
}
