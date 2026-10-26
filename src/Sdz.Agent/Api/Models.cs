using System.Text.Json.Serialization;

namespace Sdz.Agent.Api;

public sealed class Credentials
{
    public string? Username { get; set; }
    public string? Password { get; set; }
}

public sealed class Map
{
    public string? From { get; set; }
    public string To { get; set; } = "";
}

public sealed class Parameter
{
    public string Key { get; set; } = "";
    public string Value { get; set; } = "";
}

public sealed class Query
{
    public string Command { get; set; } = "";
    public string Entity { get; set; } = "";
    public string Id { get; set; } = "";
}

public sealed class Schedule
{
    public string CronExpression { get; set; } = "";
}

public sealed class Schema
{
    public string ApiResource { get; set; } = "";
    public string Entity { get; set; } = "";
    /// <summary>AGENT | JSON | CSV | XLS | XLSX | PARQUET</summary>
    public string InputFormat { get; set; } = "";
    public List<Map> Maps { get; set; } = new();
}

public sealed class Security
{
    public string Config { get; set; } = "";
    public Credentials? Credentials { get; set; }
    public string Type { get; set; } = "vpn";
}

public sealed class Setting
{
    public string Channel { get; set; } = "";
    public string DataSource { get; set; } = "";
    public List<Parameter> Parameters { get; set; } = new();
    public List<Query> Queries { get; set; } = new();
    public List<Schedule> Schedules { get; set; } = new();
    public List<Schema> Schemas { get; set; } = new();
    public Security? Security { get; set; }
    public string TenantId { get; set; } = "";
    public string Id { get; set; } = "";

    public string? Parameter(string key) => Parameters.FirstOrDefault(p => p.Key == key)?.Value;
}

public sealed class DiscoveryCredentials
{
    [JsonPropertyName("CLIENT_ID")] public string? ClientId { get; set; }
    [JsonPropertyName("CLIENT_SECRET")] public string? ClientSecret { get; set; }
}

public sealed class DiscoveryBody
{
    [JsonPropertyName("API_URL")] public string? ApiUrl { get; set; }
    [JsonPropertyName("CREDENTIALS")] public DiscoveryCredentials? Credentials { get; set; }
}

public sealed class Discovery
{
    [JsonPropertyName("DEV")] public DiscoveryBody? Dev { get; set; }
    [JsonPropertyName("HML")] public DiscoveryBody? Hml { get; set; }
    [JsonPropertyName("SND")] public DiscoveryBody? Snd { get; set; }
    [JsonPropertyName("PRD")] public DiscoveryBody? Prd { get; set; }

    public bool TryGet(string env, out DiscoveryBody body)
    {
        body = env.ToUpperInvariant() switch
        {
            "DEV" => Dev!,
            "HML" => Hml!,
            "SND" => Snd!,
            "PRD" => Prd!,
            _ => null!,
        };
        return body is not null;
    }
}

/// <summary>A message received on the /commands stream.</summary>
public sealed class CommandMessage
{
    [JsonPropertyName("command")] public string Command { get; set; } = "";
    [JsonPropertyName("arguments")] public System.Text.Json.Nodes.JsonNode? Arguments { get; set; }
    [JsonPropertyName("sender")] public string? Sender { get; set; }
}
