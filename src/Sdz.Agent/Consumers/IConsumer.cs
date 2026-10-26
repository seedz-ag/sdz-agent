using Sdz.Agent.Api;
using Sdz.Agent.Transports;

namespace Sdz.Agent.Consumers;

/// <summary>Port of IConsumer: reads from the customer's data source and pushes through the transport.</summary>
public interface IConsumer
{
    Task ConsumeAsync(CancellationToken ct = default);
    IConsumer SetSetting(Setting setting);
    IConsumer SetTransport(ITransport transport);
}
