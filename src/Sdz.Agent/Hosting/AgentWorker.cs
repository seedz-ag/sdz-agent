using Microsoft.Extensions.Hosting;
using Sdz.Agent.Commands;
using Sdz.Agent.Core;
using Sdz.Agent.Core.Logging;
using Sdz.Agent.Services;
using Sdz.Agent.Telemetry;
using Sdz.Agent.Update;

namespace Sdz.Agent.Hosting;

/// <summary>
/// Long-running mode used by the Windows Service / systemd / launchd: runs the
/// scheduler (with the listen stream) forever and checks for updates periodically.
/// </summary>
public sealed class AgentWorker : BackgroundService
{
    private readonly SchedulerCommand _scheduler;
    private readonly CheckCommand _check;
    private readonly LogsService _logs;
    private readonly UpdateService _updates;
    private readonly TelemetryService _telemetry;
    private readonly AgentEnvironment _env;
    private readonly Logger _logger;
    private readonly IHostApplicationLifetime _lifetime;
    private readonly AgentState _state;
    private readonly ListenCommand _listen;

    public AgentWorker(SchedulerCommand scheduler, CheckCommand check, LogsService logs, UpdateService updates,
        TelemetryService telemetry, AgentEnvironment env, Logger logger, IHostApplicationLifetime lifetime, AgentState state, ListenCommand listen)
    {
        _listen = listen;
        _state = state;
        _scheduler = scheduler;
        _check = check;
        _logs = logs;
        _updates = updates;
        _telemetry = telemetry;
        _env = env;
        _logger = logger;
        _lifetime = lifetime;
    }

    protected override async Task ExecuteAsync(CancellationToken stoppingToken)
    {
        _logger.Info($"SDZ AGENT {Utils.Version} STARTING AS A SERVICE");

        _env.Set("FOREVER", "true");
        if (_env.GetOrNull("LISTEN") is null) _env.Set("LISTEN", "true");

        // the command channel (remote management, remote updates) lives for the whole process,
        // independent of the setting/scheduler cycle and of the startup auth check
        Task listenLoop = Task.CompletedTask;
        if (_env.Listen)
        {
            _scheduler.ExternalListen = true;
            _state.Listening = true;
            listenLoop = _listen.RunForeverAsync(stoppingToken);
        }

        var configured = !string.IsNullOrEmpty(_env.GetOrNull("CLIENT_ID")) && !string.IsNullOrEmpty(_env.GetOrNull("CLIENT_SECRET"));
        if (!configured)
        {
            _logger.Warn("AGENT NOT CONFIGURED: waiting for credentials from the tray app or `sdz-agent configure`");
            _state.SetError("AGENT NOT CONFIGURED");
        }

        var healthy = configured && await CheckAuthWithRetryAsync(stoppingToken).ConfigureAwait(false);
        _state.AuthOk = healthy;
        if (healthy)
        {
            _updates.MarkHealthy();
        }
        else
        {
            _logger.Warn("AUTH CHECK FAILED AT STARTUP (will keep retrying)");
            if (_updates.RegisterStartFailure())
            {
                _lifetime.StopApplication();
                return;
            }
        }

        try { await _logs.ConsumeOutputAsync(stoppingToken).ConfigureAwait(false); }
        catch (Exception e) { _logger.Error("IMPOSSIBLE TO CONSUME LOG, MAYBE ANOTHER TIME", e.Message); }

        var updateLoop = RunUpdateLoopAsync(stoppingToken);

        try
        {
            await _scheduler.ExecuteAsync(stoppingToken).ConfigureAwait(false);
        }
        catch (OperationCanceledException) when (stoppingToken.IsCancellationRequested)
        {
        }
        catch (Exception e)
        {
            _logger.Error("SCHEDULER STOPPED", e.Message);
        }
        finally
        {
            _telemetry.Stop();
            try { await updateLoop.ConfigureAwait(false); } catch { }
            try { await listenLoop.ConfigureAwait(false); } catch { }
        }

        if (!stoppingToken.IsCancellationRequested) _lifetime.StopApplication();
    }

    /// <summary>
    /// At boot the network (DNS, VPN, proxy) is often not ready when the service starts: retry the
    /// auth check for a couple of minutes before declaring the start unhealthy (which feeds the
    /// post-update rollback counter). The scheduler keeps retrying forever after that anyway.
    /// </summary>
    private async Task<bool> CheckAuthWithRetryAsync(CancellationToken ct)
    {
        const int attempts = 6;
        for (var i = 1; i <= attempts; i++)
        {
            if (await _check.CheckAuthAsync(ct).ConfigureAwait(false)) return true;
            if (i == attempts) break;
            _logger.Warn($"AUTH CHECK FAILED AT STARTUP (ATTEMPT {i}/{attempts}), RETRYING IN 20S");
            // wake up early when new credentials arrive through the control channel (validated there)
            for (var t = 0; t < 20; t++)
            {
                if (_state.AuthOk) return true;
                try { await Task.Delay(TimeSpan.FromSeconds(1), ct).ConfigureAwait(false); } catch { return false; }
            }
        }
        return false;
    }

    private async Task RunUpdateLoopAsync(CancellationToken ct)
    {
        if (!_updates.AutoUpdateEnabled) return;
        var interval = TimeSpan.FromHours(6);
        var initialDelay = TimeSpan.FromMinutes(5);

        try { await Task.Delay(initialDelay, ct).ConfigureAwait(false); } catch { return; }

        while (!ct.IsCancellationRequested)
        {
            try
            {
                var version = await _updates.CheckAndApplyAsync(apply: true, ct).ConfigureAwait(false);
                if (version is not null)
                {
                    _logger.Info($"UPDATE TO {version} LAUNCHED, WAITING FOR THE INSTALLER TO RESTART THE SERVICE");
                    return;
                }
            }
            catch (OperationCanceledException) when (ct.IsCancellationRequested)
            {
                return;
            }
            catch (Exception e)
            {
                _logger.Warn("UPDATE CHECK FAILED", e.Message);
            }

            try { await Task.Delay(interval, ct).ConfigureAwait(false); } catch { return; }
        }
    }
}
