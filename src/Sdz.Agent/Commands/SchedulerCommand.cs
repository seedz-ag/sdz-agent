using Cronos;
using Sdz.Agent.Api;
using Sdz.Agent.Core;
using Sdz.Agent.Core.Logging;
using Sdz.Agent.Hosting;
using Sdz.Agent.Telemetry;

namespace Sdz.Agent.Commands;

/// <summary>
/// Port of SchedulerCommand: schedules one job per setting cron expression,
/// optionally keeps the listen stream open, and restarts itself whenever the
/// setting changes (checked every 60 s). With FOREVER it never gives up.
/// </summary>
public sealed class SchedulerCommand
{
    private readonly ApiService _api;
    private readonly AgentEnvironment _env;
    private readonly ExecuteCommand _execute;
    private readonly ListenCommand _listen;
    private readonly Logger _logger;
    private readonly TelemetryService _telemetry;
    private readonly AgentState _state;

    /// <summary>Set by the service host, which keeps the command channel in its own loop (independent of the setting cycle).</summary>
    public bool ExternalListen { get; set; }
    private CancellationTokenSource? _cycle;

    public SchedulerCommand(ApiService api, AgentEnvironment env, ExecuteCommand execute, ListenCommand listen, Logger logger, TelemetryService telemetry, AgentState state)
    {
        _api = api;
        _env = env;
        _execute = execute;
        _listen = listen;
        _logger = logger;
        _telemetry = telemetry;
        _state = state;
    }

    /// <summary>Cancels the current cycle so the scheduler re-reads the setting (used after a reconfiguration).</summary>
    public void RequestRestart()
    {
        _restartRequested = true;
        try { _cycle?.Cancel(); } catch { }
    }

    private volatile bool _restartRequested;

    public async Task ExecuteAsync(CancellationToken ct = default)
    {
        while (!ct.IsCancellationRequested)
        {
            if (string.IsNullOrEmpty(_env.GetOrNull("CLIENT_ID")) || string.IsNullOrEmpty(_env.GetOrNull("CLIENT_SECRET")) || string.IsNullOrEmpty(_env.GetOrNull("API_URL")))
            {
                // not configured yet: idle until the control channel saves credentials (RequestRestart) or the process stops
                using var idle = CancellationTokenSource.CreateLinkedTokenSource(ct);
                _cycle = idle;
                if (_restartRequested) { _restartRequested = false; idle.Cancel(); }
                try { await Task.Delay(TimeSpan.FromMinutes(5), idle.Token).ConfigureAwait(false); }
                catch (OperationCanceledException) when (!ct.IsCancellationRequested) { _restartRequested = false; }
                finally { _cycle = null; }
                continue;
            }

            try
            {
                await RunUntilSettingChangesAsync(ct).ConfigureAwait(false);
            }
            catch (OperationCanceledException) when (ct.IsCancellationRequested)
            {
                _logger.Info("STOPING SCHEDULER");
                return;
            }
            catch (SettingChangedException)
            {
                // restart immediately with the new setting
                continue;
            }
            catch (OperationCanceledException) when (_restartRequested)
            {
                _restartRequested = false;
                continue;
            }
            catch (Exception error)
            {
                _logger.Error("SCHEDULER ERROR", error.Message);
                _state.SetError(error.Message);
                if (!_env.Forever) throw;
                await Task.Delay(TimeSpan.FromSeconds(60), ct).ConfigureAwait(false);
            }

            if (!_env.Forever) return;
        }
    }

    private sealed class SettingChangedException : Exception { }

    private async Task RunUntilSettingChangesAsync(CancellationToken ct)
    {
        _telemetry.Start(TelemetryMode.Scheduler);
        _logger.Info("STARTING SCHEDULER");

        var setting = await _api.GetSettingAsync(ct).ConfigureAwait(false);
        var snapshot = Json.Serialize(setting);
        _state.AuthOk = true;
        _state.SetError(null);
        _state.SetSchedules(setting.Schedules.Select(s => s.CronExpression));

        _telemetry.SetWorkloadContext(new Dictionary<string, object?>
        {
            ["schedules"] = setting.Schedules.Select(s => s.CronExpression).ToList(),
        });

        using var cycle = CancellationTokenSource.CreateLinkedTokenSource(ct);
        _cycle = cycle;
        // RequestRestart may have arrived while GetSettingAsync was in flight (e.g. credentials cleared): do not arm the jobs
        if (_restartRequested) { _restartRequested = false; cycle.Cancel(); }
        var jobs = new List<Task>();

        foreach (var schedule in setting.Schedules)
        {
            _logger.Info($"SCHEDULING JOB AT {schedule.CronExpression}");
            var expression = ParseCron(schedule.CronExpression);
            if (expression is null)
            {
                _logger.Error($"INVALID CRON EXPRESSION: {schedule.CronExpression}");
                continue;
            }
            jobs.Add(RunJobAsync(expression, cycle.Token));
        }

        if (_env.Listen && !ExternalListen)
        {
            _state.Listening = true;
            jobs.Add(_listen.RunForeverAsync(cycle.Token));
        }
        UpdateNextRun(setting);

        try
        {
            while (!cycle.IsCancellationRequested)
            {
                await Task.Delay(TimeSpan.FromSeconds(60), cycle.Token).ConfigureAwait(false);
                var verify = await _api.GetSettingAsync(cycle.Token).ConfigureAwait(false);
                if (Json.Serialize(verify) != snapshot)
                {
                    _logger.Warn("SETTING CHANGED");
                    throw new SettingChangedException();
                }
            }
        }
        finally
        {
            _cycle = null;
            cycle.Cancel();
            try { await Task.WhenAll(jobs).ConfigureAwait(false); } catch { }
        }
    }

    private void UpdateNextRun(Setting setting)
    {
        var next = setting.Schedules
            .Select(s => ParseCron(s.CronExpression)?.GetNextOccurrence(DateTimeOffset.Now, TimeZoneInfo.Local))
            .Where(n => n is not null)
            .OrderBy(n => n)
            .FirstOrDefault();
        _state.SetNextRun(next);
    }

    private async Task RunJobAsync(CronExpression expression, CancellationToken ct)
    {
        while (!ct.IsCancellationRequested)
        {
            var next = expression.GetNextOccurrence(DateTimeOffset.Now, TimeZoneInfo.Local);
            if (next is null) return;

            var delay = next.Value - DateTimeOffset.Now;
            if (delay > TimeSpan.Zero)
            {
                try { await Task.Delay(delay, ct).ConfigureAwait(false); }
                catch (OperationCanceledException) { return; }
            }

            if (_execute.IsRunning)
            {
                _logger.Warn("EXTRACTION ALREADY RUNNING, SKIPPING SCHEDULED RUN");
                continue;
            }

            try
            {
                await _execute.ExecuteAsync(ct).ConfigureAwait(false);
                _telemetry.SetWorkloadContext(new Dictionary<string, object?> { ["lastExecutionAt"] = DateTime.UtcNow.ToString("o") });
                _state.ExecutionFinished(true);
            }
            catch (OperationCanceledException) when (ct.IsCancellationRequested)
            {
                return;
            }
            catch (Exception e)
            {
                _state.ExecutionFinished(false, e.Message);
            }
            _state.SetNextRun(expression.GetNextOccurrence(DateTimeOffset.Now, TimeZoneInfo.Local));
        }
    }

    public static CronExpression? ParseCron(string expression)
    {
        try
        {
            var fields = expression.Trim().Split(' ', StringSplitOptions.RemoveEmptyEntries);
            return CronExpression.Parse(expression.Trim(), fields.Length >= 6 ? CronFormat.IncludeSeconds : CronFormat.Standard);
        }
        catch
        {
            return null;
        }
    }
}
