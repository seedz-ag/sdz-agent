using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Hosting;
using Microsoft.Extensions.Hosting.Systemd;
using Microsoft.Extensions.Hosting.WindowsServices;
using Microsoft.Extensions.Logging;
using Sdz.Agent.Api;
using Sdz.Agent.Cli;
using Sdz.Agent.Commands;
using Sdz.Agent.Core;
using Sdz.Agent.Core.Logging;
using Sdz.Agent.Hosting;
using Sdz.Agent.Services;

namespace Sdz.Agent;

public static class Program
{
    private const string Usage = """
        SDZ Agent {0}

        Usage: sdz-agent <command> [options]

        Commands:
          run                 Service entrypoint: scheduler + listen, forever (also what the
                              OS service manager starts). Outside a service manager it runs
                              a single extraction, like the legacy `agent run`.
          execute             One extraction now (-e ENV, -n DAYS, -q QUERY, -r, -s SCHEMA, -c)
          scheduler           Run the scheduler in the foreground (--no-listen, --no-forever)
          listen              Listen for remote commands only (--retries N, --session-ttl MINUTES:
                              close after N minutes without an effective command; Ping does not count)
          check <type>        auth | datasource | dns | speed | all
          credentials <action> set | show | test | clear  (terminal management of the credentials;
                              set: --client-id, --client-secret | --client-secret-stdin, --api-url,
                              --non-interactive, or SDZ_CLIENT_ID / SDZ_CLIENT_SECRET / SDZ_API_URL;
                              show --reveal; clear --yes). Applies to the running service at once.
          configure           Alias of `credentials set`
          update [--check]    Check for a new release and install it
          service <action>    install | uninstall | start | stop | restart | status
          status              Live status from the running service (control channel)
          logs export         Save every log line to a text file (--output FILE; default: current folder)
          version             Print the version

        Global options:
          -c, --use-console-log   Print logs to the console
          -v, --verbose
          --data-dir <path>       Override the data directory (or SDZ_AGENT_DATA_DIR)
        """;

    public static async Task<int> Main(string[] args)
    {
        var cli = CommandLine.Parse(args);
        var command = cli.Command?.ToLowerInvariant();

        if (command is null or "help" or "--help" || cli.Has("help"))
        {
            Console.WriteLine(Usage, Utils.Version);
            return command is null ? 1 : 0;
        }

        if (command is "version" || cli.Has("version"))
        {
            Console.WriteLine(Utils.Version);
            return 0;
        }

        if (cli.Get("data-dir") is { } dataDir)
        {
            Environment.SetEnvironmentVariable(AgentPaths.DataDirVariable, dataDir);
        }

        var paths = new AgentPaths();
        var isService = IsServiceContext();

        if (command == "service")
        {
            var action = cli.Positional.FirstOrDefault() ?? "status";
            return ServiceManager.Run(action, paths);
        }

        if (command == "status")
        {
            return await PrintStatusAsync(paths).ConfigureAwait(false);
        }

        if (command == "logs")
        {
            return await ExportLogsAsync(paths, cli).ConfigureAwait(false);
        }

        AgentEnvironment env;
        try
        {
            // service mode and `status` tolerate a missing configuration: the tray app can configure it later
            env = new AgentEnvironment(paths, skipCredentialValidation: command is "configure" or "credentials" or "status" || (isService && command == "run"));
        }
        catch (EnvironmentValidationException e)
        {
            Console.Error.WriteLine($"✖ {e.Message}");
            Console.Error.WriteLine("  Run `sdz-agent configure` to set CLIENT_ID / CLIENT_SECRET.");
            return 2;
        }

        // CLI options become environment overrides (mergeEnv)
        env.Merge(cli.Options.Where(kv => kv.Key is not ("data-dir" or "help" or "check" or "non-interactive" or "client-id" or "client-secret" or "client-secret-stdin" or "api-url" or "overwrite" or "reveal" or "yes"))
            .Select(kv => new KeyValuePair<string, string?>(kv.Key, kv.Value)));

        if (isService && command == "run") env.Set("USE_CONSOLE_LOG", "true");

        if (isService && command == "run")
        {
            return await RunAsServiceAsync(paths, env).ConfigureAwait(false);
        }

        var services = new ServiceCollection().AddAgent(paths, env);
        await using var provider = services.BuildServiceProvider();

        var logger = provider.GetRequiredService<Logger>();
        var api = provider.GetRequiredService<ApiService>();
        var consoleSink = new ConsoleLogSink();
        if (env.UseConsoleLog || command is "scheduler" or "listen") logger.Attach(consoleSink);

        var isCredentials = command is "configure" or "credentials";
        await using var apiSink = isCredentials ? null : new ApiLogSink(paths, log => api.SendLogAsync(log));
        if (apiSink is not null) logger.Attach(apiSink);

        var cts = new CancellationTokenSource();
        void Cancel() { try { if (!cts.IsCancellationRequested) cts.Cancel(); } catch (ObjectDisposedException) { } }
        Console.CancelKeyPress += (_, e) => { e.Cancel = true; Cancel(); };
        AppDomain.CurrentDomain.ProcessExit += (_, _) => Cancel();

        var exitCode = 0;
        try
        {
            if (!isCredentials)
            {
                try
                {
                    logger.Info("CONSUMING LOG");
                    await provider.GetRequiredService<LogsService>().ConsumeOutputAsync(cts.Token).ConfigureAwait(false);
                }
                catch (Exception e)
                {
                    logger.Error("IMPOSSIBLE TO CONSUME LOG, MAYBE ANOTHER TIME", e.Message);
                }
            }

            switch (command)
            {
                case "check":
                {
                    var type = cli.Positional.FirstOrDefault()?.ToLowerInvariant() ?? "all";
                    if (type is not ("auth" or "datasource" or "dns" or "speed" or "all"))
                    {
                        Console.Error.WriteLine("✖ check type must be one of: auth, datasource, dns, speed, all");
                        return 1;
                    }
                    env.Set("TYPE", type);
                    Console.WriteLine("RUNNING ...");
                    var result = await provider.GetRequiredService<CheckCommand>().ExecuteAsync(type, cts.Token).ConfigureAwait(false);
                    PrintCheck(result);
                    exitCode = result.Type switch
                    {
                        "auth" => result.CheckAuth ? 0 : 1,
                        "datasource" => result.CheckDataSource ? 0 : 1,
                        "dns" => result.CheckDns ? 0 : 1,
                        "speed" => result.CheckConnectionSpeed is null ? 1 : 0,
                        _ => result.CheckAuth && result.CheckDataSource ? 0 : 1,
                    };
                    break;
                }
                case "configure":
                case "credentials":
                {
                    var action = command == "configure" ? "set" : cli.Positional.FirstOrDefault() ?? "show";
                    exitCode = await provider.GetRequiredService<CredentialsCommand>().ExecuteAsync(action, new CredentialsOptions
                    {
                        ClientId = cli.Get("client-id"),
                        ClientSecret = cli.Get("client-secret"),
                        ApiUrl = cli.Get("api-url"),
                        SecretFromStdin = cli.Flag("client-secret-stdin"),
                        NonInteractive = cli.Flag("non-interactive"),
                        Reveal = cli.Flag("reveal"),
                        Yes = cli.Flag("yes") || cli.Flag("overwrite") || cli.Flag("non-interactive"),
                    }, cts.Token).ConfigureAwait(false);
                    break;
                }
                case "run":
                case "execute":
                    if (!env.UseConsoleLog) Console.WriteLine("RUNNING ...");
                    try
                    {
                        await provider.GetRequiredService<ExecuteCommand>().ExecuteAsync(cts.Token).ConfigureAwait(false);
                        Console.WriteLine("✔ DONE");
                    }
                    catch (Exception e)
                    {
                        logger.Error(e is Core.Http.HttpRequestFailedException h ? h.Describe() : e.Message);
                        Console.WriteLine("✖ ERROR");
                        exitCode = 1;
                    }
                    break;
                case "listen":
                {
                    var retries = int.TryParse(cli.Get("retries"), out var r) ? r : 1;
                    var listen = provider.GetRequiredService<ListenCommand>();
                    var byTtl = await listen.RunSessionAsync(retries, cts.Token).ConfigureAwait(false);
                    Console.WriteLine(byTtl ? "✔ SESSION CLOSED BY TTL" : "✖ STOPPED");
                    break;
                }
                case "scheduler":
                {
                    if (!cli.Has("listen")) env.Set("LISTEN", "true");
                    if (!cli.Has("forever")) env.Set("FOREVER", "true");
                    var control = ActivatorUtilities.CreateInstance<ControlServer>(provider);
                    await control.StartAsync(cts.Token).ConfigureAwait(false);
                    try
                    {
                        await provider.GetRequiredService<SchedulerCommand>().ExecuteAsync(cts.Token).ConfigureAwait(false);
                        Console.WriteLine("✔ STOPPED");
                    }
                    catch (Exception e)
                    {
                        logger.Error(e.Message);
                        Console.WriteLine("✖ ERROR");
                        exitCode = 1;
                    }
                    finally
                    {
                        try { await control.StopAsync(CancellationToken.None).ConfigureAwait(false); } catch { }
                    }
                    break;
                }
                case "update":
                    exitCode = await provider.GetRequiredService<UpdateCommand>().ExecuteAsync(cli.Flag("check"), cts.Token).ConfigureAwait(false);
                    break;
                default:
                    Console.Error.WriteLine($"✖ unknown command '{command}'");
                    Console.WriteLine(Usage, Utils.Version);
                    return 1;
            }
        }
        finally
        {
            if (apiSink is not null) await apiSink.FlushAsync().ConfigureAwait(false);
        }

        return exitCode;
    }

    private static bool IsServiceContext() =>
        WindowsServiceHelpers.IsWindowsService()
        || SystemdHelpers.IsSystemdService()
        || Environment.GetEnvironmentVariable("SDZ_AGENT_SERVICE") == "1";

    private static async Task<int> RunAsServiceAsync(AgentPaths paths, AgentEnvironment env)
    {
        paths.EnsureDirectories();

        var builder = Host.CreateApplicationBuilder();
        builder.Services.AddWindowsService(o => o.ServiceName = ServiceManager.ServiceName);
        builder.Services.AddSystemd();
        builder.Services.AddAgent(paths, env);
        builder.Services.AddHostedService<AgentWorker>();
        builder.Services.AddHostedService<ControlServer>();
        builder.Logging.ClearProviders();
        builder.Logging.AddSimpleConsole(o => { o.SingleLine = true; o.TimestampFormat = "yyyy-MM-dd HH:mm:ss "; });
        builder.Services.Configure<HostOptions>(o => o.ShutdownTimeout = TimeSpan.FromSeconds(60));

        var host = builder.Build();
        var logger = host.Services.GetRequiredService<Logger>();
        var api = host.Services.GetRequiredService<ApiService>();
        logger.Attach(new ConsoleLogSink());
        await using var apiSink = new ApiLogSink(paths, log => api.SendLogAsync(log));
        logger.Attach(apiSink);

        try
        {
            await host.RunAsync().ConfigureAwait(false);
            return 0;
        }
        finally
        {
            await apiSink.FlushAsync(TimeSpan.FromSeconds(20)).ConfigureAwait(false);
        }
    }

    private static async Task<int> PrintStatusAsync(AgentPaths paths)
    {
        try
        {
            var response = await new Sdz.Agent.Control.ControlClient { Timeout = TimeSpan.FromSeconds(10) }.StatusAsync().ConfigureAwait(false);
            if (response.Status is not { } s) { Console.Error.WriteLine($"✖ {response.Message}"); return 1; }
            Console.WriteLine($"SDZ Agent {s.Version} (service running since {s.StartedAt:yyyy-MM-dd HH:mm})");
            Console.WriteLine($"  data dir:   {s.DataDir}");
            Console.WriteLine($"  configured: {(s.Configured ? $"yes (client {s.ClientId})" : "no")}");
            Console.WriteLine($"  api:        {s.ApiUrl}");
            Console.WriteLine($"  auth:       {(s.AuthOk ? "ok" : "failed / not checked")}");
            Console.WriteLine($"  listening:  {(s.Listening ? "yes" : "no")}");
            Console.WriteLine($"  schedules:  {(s.Schedules.Count == 0 ? "-" : string.Join(" | ", s.Schedules))}");
            Console.WriteLine($"  running:    {(s.Running ? "extraction in progress" : "idle")}");
            Console.WriteLine($"  last run:   {(s.LastExecutionAt is { } l ? $"{l:yyyy-MM-dd HH:mm:ss} ({(s.LastExecutionOk == true ? "ok" : "failed")})" : "-")}");
            Console.WriteLine($"  next run:   {(s.NextRunAt is { } n ? n.ToString("yyyy-MM-dd HH:mm:ss") : "-")}");
            if (!string.IsNullOrEmpty(s.LastError)) Console.WriteLine($"  last error: {s.LastError}");
            return 0;
        }
        catch (Exception e)
        {
            Console.WriteLine($"service not reachable ({e.Message})");
            return ServiceManager.Run("status", paths);
        }
    }

    /// <summary>`sdz-agent logs export [--output FILE]`: reads logs/ directly, or asks the service when this user cannot.</summary>
    private static async Task<int> ExportLogsAsync(AgentPaths paths, CommandLine cli)
    {
        var action = cli.Positional.FirstOrDefault() ?? "export";
        if (action != "export")
        {
            Console.Error.WriteLine("usage: sdz-agent logs export [--output FILE]");
            return 1;
        }
        var output = Path.GetFullPath(cli.Get("output") ?? Path.Combine(Directory.GetCurrentDirectory(), Services.LogExport.DefaultFileName()));

        List<string> lines;
        string source;
        try
        {
            lines = Services.LogExport.ReadAll(paths);
            source = paths.LogsDir;
            if (lines.Count == 0) throw new UnauthorizedAccessException();
        }
        catch (UnauthorizedAccessException)
        {
            try
            {
                var response = await new Sdz.Agent.Control.ControlClient { Timeout = TimeSpan.FromSeconds(60) }.ExportLogsAsync().ConfigureAwait(false);
                lines = response.Logs ?? new List<string>();
                source = "running service";
            }
            catch (Exception e)
            {
                Console.Error.WriteLine($"✖ COULD NOT READ THE LOGS ({paths.LogsDir}): {e.Message}");
                return 2;
            }
        }

        try
        {
            Directory.CreateDirectory(Path.GetDirectoryName(output)!);
            await using var file = File.Create(output);
            await Services.LogExport.WriteAsync(file, lines, $"origem: {source}").ConfigureAwait(false);
        }
        catch (Exception e)
        {
            Console.Error.WriteLine($"✖ COULD NOT WRITE {output}: {e.Message}");
            return 4;
        }
        Console.WriteLine($"✔ {lines.Count} LINES EXPORTED TO {output}");
        return 0;
    }

    private static void PrintCheck(CheckResult r)
    {
        static string Mark(bool ok) => ok ? "SUCCESS" : "FAIL";
        if (r.Type is "all" or "datasource") Console.WriteLine($"    DATASOURCE: {Mark(r.CheckDataSource)}");
        if (r.Type is "all" or "dns") Console.WriteLine($"           DNS: {Mark(r.CheckDns)}");
        if (r.Type is "all" or "speed")
        {
            Console.WriteLine(r.CheckConnectionSpeed is { } s
                ? $"INTERNET SPEED: ▼ {s.Download} mbps / ▲ {s.Upload} mbps"
                : "INTERNET SPEED: NO CONNECTION");
        }
        if (r.Type is "all" or "auth") Console.WriteLine($"          AUTH: {Mark(r.CheckAuth)}");
        Console.WriteLine("✔ DONE");
    }
}
