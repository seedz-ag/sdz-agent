using Renci.SshNet;
using Renci.SshNet.Sftp;
using Sdz.Agent.Core.Logging;

namespace Sdz.Agent.Adapters;

public sealed class FtpAdapterConfig
{
    public string Host { get; init; } = "";
    public string Username { get; init; } = "";
    public string Password { get; init; } = "";
    public int Port { get; init; } = 22;
}

/// <summary>Port of FTPAdapter (ssh2-sftp-client): SFTP list/download/upload/rename.</summary>
public sealed class FtpAdapter : IDisposable
{
    private readonly Logger _logger;
    private FtpAdapterConfig? _config;
    private SftpClient? _client;

    public FtpAdapter(Logger logger) => _logger = logger;

    public bool IsConnected => _client is { IsConnected: true };

    public void SetConfig(FtpAdapterConfig config) => _config = config;

    public async Task<bool> ConnectAsync(CancellationToken ct = default)
    {
        if (IsConnected) return true;
        if (_config is null) throw new InvalidOperationException("FTP NOT CONFIGURED");
        try
        {
            _client?.Dispose();
            _client = new SftpClient(_config.Host, _config.Port, _config.Username, _config.Password)
            {
                OperationTimeout = TimeSpan.FromSeconds(20),
                KeepAliveInterval = TimeSpan.FromSeconds(10),
            };
            _client.ConnectionInfo.Timeout = TimeSpan.FromSeconds(20);
            await _client.ConnectAsync(ct).ConfigureAwait(false);
            return true;
        }
        catch
        {
            _logger.Error("INVALID FTP CONFIGURATION.");
            throw;
        }
    }

    public Task DisconnectAsync()
    {
        if (_client is { IsConnected: true }) _client.Disconnect();
        return Task.CompletedTask;
    }

    public async Task<bool> SendFileAsync(string localFileName, string remoteFileName, CancellationToken ct = default)
    {
        try
        {
            await ConnectAsync(ct).ConfigureAwait(false);
            await using var stream = File.OpenRead(localFileName);
            await Task.Factory.FromAsync(_client!.BeginUploadFile(stream, remoteFileName), _client.EndUploadFile).ConfigureAwait(false);
            return true;
        }
        catch
        {
            _logger.Error($"ERROR SENDING {remoteFileName} TO FTP.");
            throw;
        }
    }

    public async Task<byte[]> GetFileAsync(string remoteFileName, CancellationToken ct = default)
    {
        try
        {
            await ConnectAsync(ct).ConfigureAwait(false);
            _logger.Info($"DOWNLOADING {remoteFileName} FROM FTP.");
            using var memory = new MemoryStream();
            await Task.Factory.FromAsync(_client!.BeginDownloadFile(remoteFileName, memory), _client.EndDownloadFile).ConfigureAwait(false);
            _logger.Info($"DOWNLOADED {remoteFileName} FROM FTP.");
            return memory.ToArray();
        }
        catch
        {
            _logger.Error($"ERROR DOWNLOADING {remoteFileName} FROM FTP.");
            throw;
        }
    }

    public async Task<bool> RenameFileAsync(string remoteFileName, string newRemoteFileName, CancellationToken ct = default)
    {
        try
        {
            await ConnectAsync(ct).ConfigureAwait(false);
            await _client!.RenameFileAsync(remoteFileName, newRemoteFileName, ct).ConfigureAwait(false);
            return true;
        }
        catch
        {
            _logger.Error($"ERROR RENAMING {remoteFileName} AT FTP.");
            throw;
        }
    }

    public async Task<List<ISftpFile>> ListAsync(string path, string? extension = null, CancellationToken ct = default)
    {
        try
        {
            await ConnectAsync(ct).ConfigureAwait(false);
            var list = new List<ISftpFile>();
            await foreach (var entry in _client!.ListDirectoryAsync(path, ct).ConfigureAwait(false))
            {
                if (entry.Name is "." or "..") continue;
                list.Add(entry);
            }
            if (string.IsNullOrEmpty(extension)) return list;
            var normalized = extension.StartsWith('.') ? extension.ToLowerInvariant() : "." + extension.ToLowerInvariant();
            return list.Where(e => e.Name.ToLowerInvariant().EndsWith(normalized, StringComparison.Ordinal)).ToList();
        }
        catch (Exception e)
        {
            _logger.Error($"ERROR LISTING {path} AT FTP.", e.Message);
            throw;
        }
    }

    public void Dispose() => _client?.Dispose();
}
