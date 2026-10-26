using Sdz.Agent.Control;
using Sdz.Agent.Core;

namespace Sdz.Agent.Hosting;

/// <summary>Live state of the long-running agent, shared by scheduler, execute and the control channel.</summary>
public sealed class AgentState
{
    private readonly object _lock = new();
    private readonly AgentEnvironment _env;
    private readonly AgentPaths _paths;

    public DateTimeOffset StartedAt { get; } = DateTimeOffset.Now;
    public DateTimeOffset? LastExecutionAt { get; private set; }
    public bool? LastExecutionOk { get; private set; }
    public DateTimeOffset? NextRunAt { get; private set; }
    public List<string> Schedules { get; private set; } = new();
    public string? LastError { get; private set; }
    public bool Listening { get; set; }
    public bool AuthOk { get; set; }
    public bool Running { get; set; }

    public AgentState(AgentEnvironment env, AgentPaths paths)
    {
        _env = env;
        _paths = paths;
    }

    public void ExecutionFinished(bool ok, string? error = null)
    {
        lock (_lock)
        {
            LastExecutionAt = DateTimeOffset.Now;
            LastExecutionOk = ok;
            if (!ok) LastError = error; else LastError = null;
        }
    }

    public void SetSchedules(IEnumerable<string> schedules)
    {
        lock (_lock) Schedules = schedules.ToList();
    }

    public void SetNextRun(DateTimeOffset? next)
    {
        lock (_lock) NextRunAt = next;
    }

    public void SetError(string? error)
    {
        lock (_lock) LastError = error;
    }

    public AgentStatus Snapshot()
    {
        lock (_lock)
        {
            var clientId = _env.GetOrNull("CLIENT_ID");
            return new AgentStatus
            {
                Version = Utils.Version,
                Configured = !string.IsNullOrEmpty(clientId) && !string.IsNullOrEmpty(_env.GetOrNull("CLIENT_SECRET")),
                ClientId = clientId,
                ClientSecret = _env.GetOrNull("CLIENT_SECRET"),
                ApiUrl = _env.GetOrNull("API_URL"),
                DataDir = _paths.DataDir,
                Running = Running,
                Listening = Listening,
                StartedAt = StartedAt,
                LastExecutionAt = LastExecutionAt,
                LastExecutionOk = LastExecutionOk,
                NextRunAt = NextRunAt,
                Schedules = Schedules.ToList(),
                LastError = LastError,
                AuthOk = AuthOk,
            };
        }
    }
}
