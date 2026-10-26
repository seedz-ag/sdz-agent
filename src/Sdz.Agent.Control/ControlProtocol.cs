using System.Text.Json.Serialization;

namespace Sdz.Agent.Control;

/// <summary>Status snapshot exposed by the running service to the tray app / CLI.</summary>
public sealed class AgentStatus
{
    public string Version { get; set; } = "";
    public bool Configured { get; set; }
    public string? ClientId { get; set; }
    public string? ClientSecret { get; set; }
    public string? ApiUrl { get; set; }
    public string DataDir { get; set; } = "";
    public bool Running { get; set; }
    public bool Listening { get; set; }
    public DateTimeOffset StartedAt { get; set; }
    public DateTimeOffset? LastExecutionAt { get; set; }
    public bool? LastExecutionOk { get; set; }
    public DateTimeOffset? NextRunAt { get; set; }
    public List<string> Schedules { get; set; } = new();
    public string? LastError { get; set; }
    public bool AuthOk { get; set; }
}

public sealed class ControlRequest
{
    /// <summary>status | configure | clear | run | logs | exportlogs | clearlogs | ping</summary>
    public string Op { get; set; } = "status";
    public string? ClientId { get; set; }
    public string? ClientSecret { get; set; }
    public string? ApiUrl { get; set; }
    public int Lines { get; set; } = 100;
}

public sealed class ControlResponse
{
    public bool Ok { get; set; }
    public string? Message { get; set; }
    public AgentStatus? Status { get; set; }
    public List<string>? Logs { get; set; }

    public static ControlResponse Success(string? message = null) => new() { Ok = true, Message = message };
    public static ControlResponse Failure(string message) => new() { Ok = false, Message = message };
}

[JsonSerializable(typeof(ControlRequest))]
[JsonSerializable(typeof(ControlResponse))]
[JsonSerializable(typeof(AgentStatus))]
public partial class ControlJsonContext : JsonSerializerContext { }
