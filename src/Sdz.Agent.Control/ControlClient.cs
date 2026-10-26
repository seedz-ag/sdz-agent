using System.IO.Pipes;
using System.Net.Sockets;
using System.Text;
using System.Text.Json;

namespace Sdz.Agent.Control;

/// <summary>One request / one response over the local control channel.</summary>
public sealed class ControlClient
{
    public TimeSpan Timeout { get; init; } = TimeSpan.FromSeconds(60);

    public async Task<ControlResponse> SendAsync(ControlRequest request, CancellationToken ct = default)
    {
        using var cts = CancellationTokenSource.CreateLinkedTokenSource(ct);
        cts.CancelAfter(Timeout);
        await using var stream = await ConnectAsync(cts.Token).ConfigureAwait(false);

        var payload = JsonSerializer.Serialize(request, ControlJsonContext.Default.ControlRequest) + "\n";
        await stream.WriteAsync(Encoding.UTF8.GetBytes(payload), cts.Token).ConfigureAwait(false);
        await stream.FlushAsync(cts.Token).ConfigureAwait(false);

        using var reader = new StreamReader(stream, Encoding.UTF8, leaveOpen: true);
        var line = await reader.ReadLineAsync(cts.Token).ConfigureAwait(false)
                   ?? throw new IOException("service closed the connection");
        return JsonSerializer.Deserialize(line, ControlJsonContext.Default.ControlResponse)
               ?? ControlResponse.Failure("invalid response");
    }

    public Task<ControlResponse> StatusAsync(CancellationToken ct = default) => SendAsync(new ControlRequest { Op = "status" }, ct);
    public Task<ControlResponse> RunAsync(CancellationToken ct = default) => SendAsync(new ControlRequest { Op = "run" }, ct);
    public Task<ControlResponse> ClearLogsAsync(CancellationToken ct = default) => SendAsync(new ControlRequest { Op = "clearlogs" }, ct);
    public Task<ControlResponse> LogsAsync(int lines = 100, CancellationToken ct = default) => SendAsync(new ControlRequest { Op = "logs", Lines = lines }, ct);
    /// <summary>Every logs/agent-*.log line (oldest first, capped by the service), for "export to file".</summary>
    public Task<ControlResponse> ExportLogsAsync(CancellationToken ct = default) => SendAsync(new ControlRequest { Op = "exportlogs" }, ct);
    /// <summary>Removes the saved credentials; the service goes idle until the next configure.</summary>
    public Task<ControlResponse> ClearCredentialsAsync(CancellationToken ct = default) => SendAsync(new ControlRequest { Op = "clear" }, ct);
    public Task<ControlResponse> ConfigureAsync(string clientId, string clientSecret, string? apiUrl, CancellationToken ct = default) =>
        SendAsync(new ControlRequest { Op = "configure", ClientId = clientId, ClientSecret = clientSecret, ApiUrl = apiUrl }, ct);

    private static async Task<Stream> ConnectAsync(CancellationToken ct)
    {
        if (OperatingSystem.IsWindows())
        {
            var pipe = new NamedPipeClientStream(".", ControlEndpoint.PipeName, PipeDirection.InOut, PipeOptions.Asynchronous);
            await pipe.ConnectAsync(5000, ct).ConfigureAwait(false);
            return pipe;
        }

        Exception? last = null;
        foreach (var path in ControlEndpoint.ClientSocketCandidates())
        {
            if (!File.Exists(path)) continue;
            var socket = new Socket(AddressFamily.Unix, SocketType.Stream, ProtocolType.Unspecified);
            try
            {
                await socket.ConnectAsync(new UnixDomainSocketEndPoint(path), ct).ConfigureAwait(false);
                return new NetworkStream(socket, ownsSocket: true);
            }
            catch (Exception e)
            {
                socket.Dispose();
                last = e;
            }
        }
        throw new IOException("SDZ Agent service is not running (no control socket found)" + (last is null ? "" : $": {last.Message}"), last);
    }
}
