using Sdz.Agent.Api;
using Sdz.Agent.Core;
using Sdz.Agent.Core.Logging;

namespace Sdz.Agent.Services;

/// <summary>Port of LogsService.consumeOutput: re-ships output/*.log entries that failed to reach the API.</summary>
public sealed class LogsService
{
    private readonly ApiService _api;
    private readonly AgentPaths _paths;
    private readonly Logger _logger;

    public LogsService(ApiService api, AgentPaths paths, Logger logger)
    {
        _api = api;
        _paths = paths;
        _logger = logger;
    }

    public async Task ConsumeOutputAsync(CancellationToken ct = default)
    {
        if (!Directory.Exists(_paths.OutputDir)) return;

        foreach (var file in Directory.EnumerateFiles(_paths.OutputDir, "*.log").ToList())
        {
            var failed = false;
            var batch = new List<string[]>();

            foreach (var line in File.ReadLines(file))
            {
                if (string.IsNullOrWhiteSpace(line)) continue;
                string[]? item;
                try { item = Json.Deserialize<string[]>(line); } catch { continue; }
                if (item is null || item.Length < 2) continue;

                // persisted as [timestamp, level, ...message], shipped as [level, timestamp, message]
                batch.Add(new[] { item[1], item[0], item.Length > 2 ? item[2] : "" });

                if (batch.Count == 100)
                {
                    if (!await _api.SendLogAsync(batch, ct).ConfigureAwait(false)) failed = true;
                    batch = new List<string[]>();
                }
            }

            if (batch.Count > 0 && !await _api.SendLogAsync(batch, ct).ConfigureAwait(false)) failed = true;

            if (failed)
            {
                _logger.Error($"FAILED TO SEND LOGS FROM {file}, FILE KEPT FOR RETRY");
            }
            else
            {
                try { File.Delete(file); } catch { }
            }
        }
    }
}
