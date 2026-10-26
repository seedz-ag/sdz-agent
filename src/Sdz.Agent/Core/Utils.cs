using System.Reflection;
using Sdz.Agent.Api;
using Sdz.Agent.Core.Logging;
using Sdz.Agent.Data;

namespace Sdz.Agent.Core;

/// <summary>Port of UtilsService.</summary>
public sealed class Utils
{
    private readonly AgentEnvironment _env;
    private readonly AgentPaths _paths;
    private readonly Logger _logger;
    private readonly Dictionary<string, int> _counter = new();
    private readonly object _counterLock = new();

    public static string Version { get; } =
        (Assembly.GetEntryAssembly() ?? typeof(Utils).Assembly)
            .GetCustomAttribute<AssemblyInformationalVersionAttribute>()?.InformationalVersion?.Split('+')[0]
        ?? typeof(Utils).Assembly.GetName().Version?.ToString(3)
        ?? "0.0.0";

    public Utils(AgentEnvironment env, AgentPaths paths, Logger logger)
    {
        _env = env;
        _paths = paths;
        _logger = logger;
    }

    public List<List<T>> ChunkData<T>(IReadOnlyList<T> data, int? length = null)
    {
        var split = length ?? _env.ChunkSize;
        if (split <= 0) split = 1000;
        var result = new List<List<T>>();
        if (data.Count == 0)
        {
            result.Add(new List<T>());
            return result;
        }
        for (var i = 0; i < data.Count; i += split)
        {
            result.Add(data.Skip(i).Take(split).ToList());
        }
        return result;
    }

    public static int CalculateRetryTime(int retry, int baseTime)
    {
        long time = baseTime;
        for (var i = 0; i < retry; i++) time *= 2;
        return (int)Math.Min(time, int.MaxValue);
    }

    public static DatabaseConfig ExtractDatabaseConfig(IEnumerable<Parameter> parameters)
    {
        var dict = parameters
            .Where(p => p.Key.StartsWith("DATABASE_", StringComparison.Ordinal))
            .ToDictionary(p => p.Key["DATABASE_".Length..].ToLowerInvariant(), p => p.Value, StringComparer.OrdinalIgnoreCase);
        return DatabaseConfig.From(dict);
    }

    public static string? FindParameter(IEnumerable<Parameter> parameters, string key) =>
        parameters.FirstOrDefault(p => p.Key == key)?.Value;

    public static bool HasAgentSchemaForCurrentEntity(IEnumerable<Schema> schemas, string entity) =>
        schemas.Any(s => s.Entity == entity && s.InputFormat == "AGENT");

    public static bool NeedsToHydrate(Schema schema) =>
        schema.InputFormat == "AGENT" && schema.Maps is { Count: > 0 };

    /// <summary>Port of UtilsService.wait: sleeps between ms and ms+2500 (random throttle).</summary>
    public Task WaitAsync(int ms, CancellationToken ct = default)
    {
        var max = ms + 2500;
        var random = Random.Shared.NextDouble() * (max - ms) + ms;
        return Task.Delay((int)Math.Round(random), ct);
    }

    public async Task WriteJsonAsync<T>(string entity, IReadOnlyList<T> data, bool exception = false)
    {
        foreach (var chunk in ChunkData(data))
        {
            int number;
            lock (_counterLock)
            {
                _counter.TryGetValue(entity, out var current);
                if (!exception) current++;
                _counter[entity] = current;
                number = current;
            }
            var file = _paths.Output($"{entity}-{number:0000}.json");
            _logger.Info("WRITING JSON: ", file);
            try
            {
                Directory.CreateDirectory(_paths.OutputDir);
                await File.WriteAllTextAsync(file, Json.Serialize(chunk, indented: true)).ConfigureAwait(false);
                _logger.Info("WRITING JSON FILE DONE: ", file);
            }
            catch (Exception ex)
            {
                _logger.Error("WRITING JSON FILE FAILED: ", file, ex.Message);
            }
        }
    }

    public static string FormatDuration(double ms)
    {
        var minutes = Math.Floor(ms / 60000);
        var seconds = (ms % 60000) / 1000;
        return $"{ms:0}ms ({minutes}min {seconds:0.00}s)";
    }

    /// <summary>Deletes output/*.ext files; port of the glob+unlink calls in ExecuteCommand.</summary>
    public void CleanOutput(params string[] extensions)
    {
        if (!Directory.Exists(_paths.OutputDir)) return;
        foreach (var ext in extensions)
        {
            foreach (var file in Directory.EnumerateFiles(_paths.OutputDir, "*." + ext))
            {
                try { File.Delete(file); } catch { }
            }
        }
    }
}
