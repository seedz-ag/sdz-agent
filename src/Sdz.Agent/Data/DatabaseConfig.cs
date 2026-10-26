namespace Sdz.Agent.Data;

/// <summary>DATABASE_* parameters of a setting, lower-cased without the prefix (port of ConfigDatabaseInterface).</summary>
public sealed class DatabaseConfig
{
    public string? Host { get; init; }
    public string? Locale { get; init; }
    public string? Schema { get; init; }
    public string? Password { get; init; }
    public int? Port { get; init; }
    public string? Server { get; init; }
    public string? Service { get; init; }
    public string? Username { get; init; }
    public string? ConnectionString { get; init; }
    /// <summary>Every DATABASE_* value, for driver-specific extras (e.g. "driver", "thick").</summary>
    public IReadOnlyDictionary<string, string> Raw { get; init; } = new Dictionary<string, string>();

    public static DatabaseConfig From(Dictionary<string, string> raw)
    {
        string? Get(string key) => raw.TryGetValue(key, out var v) && v.Length > 0 ? v : null;
        return new DatabaseConfig
        {
            Host = Get("host"),
            Locale = Get("locale"),
            Schema = Get("schema"),
            Password = Get("password"),
            Port = int.TryParse(Get("port"), out var port) ? port : null,
            Server = Get("server"),
            Service = Get("service"),
            Username = Get("username"),
            ConnectionString = Get("connectionstring"),
            Raw = raw,
        };
    }
}
