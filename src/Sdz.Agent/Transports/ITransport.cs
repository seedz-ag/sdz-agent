namespace Sdz.Agent.Transports;

/// <summary>Port of ITransport: sends a batch of rows (or a file payload) to a resource.</summary>
public interface ITransport
{
    Task SendAsync(string resource, IReadOnlyList<object?> data, CancellationToken ct = default);
}
