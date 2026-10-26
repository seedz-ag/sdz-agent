using Sdz.Agent.Api;
using Sdz.Agent.Core;
using Sdz.Agent.Core.Logging;

namespace Sdz.Agent.Transports;

/// <summary>Port of HttpTransport: posts chunks of rows to the integration API.</summary>
public sealed class HttpTransport : ITransport
{
    private readonly ApiService _api;
    private readonly AgentEnvironment _env;
    private readonly Utils _utils;
    private readonly Logger _logger;

    public HttpTransport(ApiService api, AgentEnvironment env, Utils utils, Logger logger)
    {
        _api = api;
        _env = env;
        _utils = utils;
        _logger = logger;
    }

    public async Task SendAsync(string resource, IReadOnlyList<object?> data, CancellationToken ct = default)
    {
        _logger.Info($"SENDING {data.Count} LINES TO /{resource}");

        foreach (var chunk in _utils.ChunkData(data))
        {
            _logger.Info($"SENDING CHUNK {chunk.Count} LINES TO /{resource}");
            var payload = chunk.Select(item => item is byte[] bytes ? Convert.ToBase64String(bytes) : item).ToList();
            await _api.SendResourceAsync(resource, payload, 1, ct).ConfigureAwait(false);
            await _utils.WaitAsync(_env.Throttle, ct).ConfigureAwait(false);
        }
    }
}
