using Microsoft.Extensions.DependencyInjection;
using Sdz.Agent.Adapters;
using Sdz.Agent.Api;
using Sdz.Agent.Commands;
using Sdz.Agent.Consumers;
using Sdz.Agent.Core;
using Sdz.Agent.Core.Http;
using Sdz.Agent.Core.Logging;
using Sdz.Agent.Data;
using Sdz.Agent.Hosting;
using Sdz.Agent.Services;
using Sdz.Agent.Telemetry;
using Sdz.Agent.Transports;
using Sdz.Agent.Update;

namespace Sdz.Agent;

/// <summary>Port of container.ts: every component is a singleton.</summary>
public static class Composition
{
    public static IServiceCollection AddAgent(this IServiceCollection services, AgentPaths paths, AgentEnvironment env)
    {
        services.AddSingleton(paths);
        services.AddSingleton(env);
        services.AddSingleton<Logger>();
        services.AddSingleton<AgentState>();

        // core / adapters
        services.AddSingleton<NetworkTelemetryRecorder>();
        services.AddSingleton<HttpClientAdapter>();
        services.AddSingleton<Utils>();
        services.AddSingleton<ApiService>();
        services.AddSingleton<FtpAdapter>();
        services.AddSingleton<DatabaseAdapter>();

        // services
        services.AddSingleton<HydratorService>();
        services.AddSingleton<InterpolationService>();
        services.AddSingleton<LogsService>();
        services.AddSingleton<VpnService>();
        services.AddSingleton<ConsumerResolver>();

        // consumers / transports
        services.AddSingleton<DatabaseConsumer>();
        services.AddSingleton<FtpConsumer>();
        services.AddSingleton<HttpConsumer>();
        services.AddSingleton<HttpTransport>();
        services.AddSingleton<S3Transport>();

        // telemetry
        services.AddSingleton<SystemMetrics>();
        services.AddSingleton<TelemetrySampler>();
        services.AddSingleton<TelemetryOutbox>();
        services.AddSingleton<TelemetryService>();

        // commands
        services.AddSingleton<CheckCommand>();
        services.AddSingleton<ConfigureCommand>();
        services.AddSingleton<CredentialsCommand>();
        services.AddSingleton<ExecuteCommand>();
        services.AddSingleton<ListenCommand>();
        services.AddSingleton<SchedulerCommand>();
        services.AddSingleton<UpdateCommand>();
        services.AddSingleton<UpdateService>();

        return services;
    }
}
