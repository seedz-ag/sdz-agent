namespace Sdz.Agent.Cli;

/// <summary>Tiny yargs-like parser: `cmd [positional...] --flag value --flag=value -f value --no-flag`.</summary>
public sealed class CommandLine
{
    private static readonly Dictionary<string, string> Aliases = new()
    {
        ["e"] = "env",
        ["n"] = "extract-last-n-days",
        ["q"] = "query",
        ["r"] = "raw-only",
        ["s"] = "schema",
        ["c"] = "use-console-log",
        ["l"] = "listen",
        ["f"] = "forever",
        ["v"] = "verbose",
    };

    public string? Command { get; private set; }
    public List<string> Positional { get; } = new();
    public Dictionary<string, string> Options { get; } = new(StringComparer.OrdinalIgnoreCase);

    public static CommandLine Parse(string[] args, IReadOnlyDictionary<string, string>? aliases = null)
    {
        var cli = new CommandLine();
        var map = aliases ?? Aliases;

        for (var i = 0; i < args.Length; i++)
        {
            var arg = args[i];
            if (arg.StartsWith("--", StringComparison.Ordinal))
            {
                var body = arg[2..];
                string key, value;
                var eq = body.IndexOf('=');
                if (eq >= 0)
                {
                    key = body[..eq];
                    value = body[(eq + 1)..];
                }
                else if (body.StartsWith("no-", StringComparison.Ordinal))
                {
                    key = body[3..];
                    value = "false";
                }
                else if (i + 1 < args.Length && !args[i + 1].StartsWith('-'))
                {
                    key = body;
                    value = args[++i];
                }
                else
                {
                    key = body;
                    value = "true";
                }
                cli.Options[key] = value;
            }
            else if (arg.StartsWith('-') && arg.Length > 1)
            {
                var key = map.TryGetValue(arg[1..], out var full) ? full : arg[1..];
                var value = i + 1 < args.Length && !args[i + 1].StartsWith('-') ? args[++i] : "true";
                cli.Options[key] = value;
            }
            else if (cli.Command is null)
            {
                cli.Command = arg;
            }
            else
            {
                cli.Positional.Add(arg);
            }
        }

        return cli;
    }

    public string? Get(string key) => Options.TryGetValue(key, out var v) ? v : null;
    public bool Has(string key) => Options.ContainsKey(key);
    public bool Flag(string key, bool fallback = false) => Get(key) is { } v ? v.Equals("true", StringComparison.OrdinalIgnoreCase) || v == "1" : fallback;
}
