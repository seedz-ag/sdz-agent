using System.Collections;
using Sdz.Agent.Api;

namespace Sdz.Agent.Services;

/// <summary>
/// Port of HydratorService: applies a schema's Maps (From → To, with optional
/// "|Pipe(arg)" transforms) to a raw row.
/// Deviations from the Node version: DateTime values are treated as scalars
/// (the Node flatten dropped them) and a missing From yields "" instead of the
/// literal string "undefined".
/// </summary>
public sealed class HydratorService
{
    private static readonly Dictionary<string, Func<Row, object?, string[], object?>> Pipes = new(StringComparer.Ordinal)
    {
        ["Append"] = (_, value, args) => $"{PathValue.Stringify(value)}{Arg(args, 0)}",
        ["Capitalize"] = (_, value, _) => value is string s ? s.ToUpperInvariant() : (object?)false,
        ["Concat"] = (row, value, args) => PathValue.Stringify(value) + PathValue.Stringify(PathValue.Get(row, Arg(args, 0).ToUpperInvariant(), "")),
        ["Now"] = (_, _, _) => DateTime.Now.ToString("yyyy-MM-dd"),
        ["Prepend"] = (_, value, args) => $"{Arg(args, 0)}{PathValue.Stringify(value)}",
        ["SetValue"] = (_, _, args) => Arg(args, 0),
        ["UUID"] = (_, _, _) => Guid.NewGuid().ToString(),
    };

    private static string Arg(string[] args, int i) => i < args.Length ? args[i] : "";

    public Row Flatten(object? obj)
    {
        var result = new Row();
        FlattenInto(obj, result);
        return result;
    }

    private static void FlattenInto(object? obj, Row result)
    {
        switch (obj)
        {
            case Row row:
                foreach (var (key, value) in row)
                {
                    if (value is List<object?> list)
                    {
                        // Node quirk preserved: array items are keyed by index only (parent key dropped)
                        for (var j = 0; j < list.Count; j++)
                        {
                            var temp = new Row();
                            FlattenInto(list[j], temp);
                            foreach (var (k, v) in temp) result[$"{j}.{k}"] = v;
                        }
                    }
                    else if (IsObject(value))
                    {
                        var temp = new Row();
                        FlattenInto(value, temp);
                        foreach (var (k, v) in temp) result[$"{key.ToUpperInvariant()}.{k.ToUpperInvariant()}"] = v;
                    }
                    else
                    {
                        result[key.ToUpperInvariant()] = value;
                    }
                }
                break;
            case System.Text.Json.Nodes.JsonNode node:
                FlattenInto(Core.Json.ToClr(node), result);
                break;
            case IDictionary dict:
                var converted = new Row();
                foreach (DictionaryEntry e in dict) converted[e.Key?.ToString() ?? ""] = e.Value;
                FlattenInto(converted, result);
                break;
        }
    }

    private static bool IsObject(object? value) => value is Row or IDictionary or System.Text.Json.Nodes.JsonObject;

    public Row Hydrate(IReadOnlyList<Map> mapping, Row row)
    {
        var hydrated = new Row();
        var flattened = Flatten(row);

        var normalized = new Row();
        foreach (var (key, value) in flattened) PathValue.Set(normalized, key, value);

        foreach (var map in mapping)
        {
            var from = map.From;
            var to = map.To;
            object? value = !string.IsNullOrEmpty(from) && flattened.TryGetValue(from.ToUpperInvariant(), out var raw)
                ? PathValue.Stringify(raw).Trim()
                : "";

            if (to.Contains('|'))
            {
                var pipe = to.Split('|');
                to = pipe[0];
                foreach (var segment in pipe.Skip(1))
                {
                    var open = segment.IndexOf('(');
                    var close = segment.LastIndexOf(')');
                    if (open < 0 || close < open) continue;
                    var key = segment[..open];
                    var args = segment[(open + 1)..close].Split(',');
                    if (!Pipes.TryGetValue(key, out var fn)) continue;
                    value = fn(normalized, value, args);
                    normalized[(string.IsNullOrEmpty(from) ? to : from).ToUpperInvariant()] = value;
                }
            }

            hydrated[to] = PathValue.Get(normalized, (string.IsNullOrEmpty(from) ? to : from).ToUpperInvariant(), "");
        }

        return hydrated;
    }
}
