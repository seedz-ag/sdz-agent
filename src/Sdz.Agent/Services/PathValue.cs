using System.Collections;
using System.Text.Json.Nodes;

namespace Sdz.Agent.Services;

/// <summary>
/// Dot-path access over the dynamic shapes the agent handles (Row, lists, JsonNode).
/// Mirrors the subset of dot-wild / getValueFromObject behaviour the Node agent relied on.
/// </summary>
public static class PathValue
{
    /// <summary>Gets a value by dotted path. A literal key containing dots wins over the path walk.</summary>
    public static object? Get(object? root, string path, object? fallback = null)
    {
        if (root is null || string.IsNullOrEmpty(path)) return fallback;

        if (root is Row literal && literal.TryGetValue(path, out var direct)) return direct ?? fallback;

        object? current = root;
        foreach (var rawToken in path.Split('.'))
        {
            if (current is null) return fallback;
            var token = rawToken;
            string? index = null;
            var open = token.IndexOf('[');
            if (open >= 0 && token.EndsWith(']'))
            {
                index = token[(open + 1)..^1];
                token = token[..open];
            }

            if (token == "*")
            {
                var collected = new List<object?>();
                foreach (var child in Children(current)) collected.Add(child);
                current = collected;
                continue;
            }

            if (current is List<object?> list && token.Length > 0)
            {
                // wildcard results: project the token over every element
                if (!int.TryParse(token, out var n))
                {
                    var projected = new List<object?>();
                    foreach (var element in list)
                    {
                        var value = Step(element, token);
                        if (value is List<object?> inner) projected.AddRange(inner);
                        else if (value is not null) projected.Add(value);
                    }
                    current = projected;
                }
                else
                {
                    current = n >= 0 && n < list.Count ? list[n] : null;
                }
            }
            else if (token.Length > 0)
            {
                current = Step(current, token);
            }

            if (index is not null && current is not null)
            {
                current = int.TryParse(index, out var i) ? Step(current, i.ToString()) : Step(current, index);
            }
        }

        return current ?? fallback;
    }

    private static IEnumerable<object?> Children(object? value)
    {
        switch (value)
        {
            case List<object?> list: foreach (var v in list) yield return v; break;
            case Row row: foreach (var v in row.Values) yield return v; break;
            case JsonArray arr: foreach (var v in arr) yield return v; break;
            case JsonObject obj: foreach (var (_, v) in obj) yield return v; break;
            case IEnumerable e when value is not string: foreach (var v in e) yield return v; break;
        }
    }

    private static object? Step(object? current, string token)
    {
        switch (current)
        {
            case Row row:
                if (row.TryGetValue(token, out var v)) return v;
                var key = row.Keys.FirstOrDefault(k => string.Equals(k, token, StringComparison.OrdinalIgnoreCase));
                return key is null ? null : row[key];
            case IDictionary<string, string> dict:
                return dict.TryGetValue(token, out var s) ? s : null;
            case IDictionary<string, object> odict:
                return odict.TryGetValue(token, out var o) ? o : null;
            case List<object?> list:
                return int.TryParse(token, out var n) && n >= 0 && n < list.Count ? list[n] : null;
            case JsonObject obj:
                return obj.TryGetPropertyValue(token, out var node) ? Unwrap(node) : null;
            case JsonArray arr:
                return int.TryParse(token, out var i) && i >= 0 && i < arr.Count ? Unwrap(arr[i]) : null;
            case IList plain:
                return int.TryParse(token, out var j) && j >= 0 && j < plain.Count ? plain[j] : null;
            default:
                return null;
        }
    }

    private static object? Unwrap(JsonNode? node) => node is JsonValue ? Core.Json.ToClr(node) : node;

    /// <summary>Sets a value by dotted path creating intermediate rows (dot-wild set).</summary>
    public static void Set(Row root, string path, object? value)
    {
        var tokens = path.Split('.');
        var current = root;
        for (var i = 0; i < tokens.Length - 1; i++)
        {
            if (!current.TryGetValue(tokens[i], out var next) || next is not Row nextRow)
            {
                nextRow = new Row();
                current[tokens[i]] = nextRow;
            }
            current = nextRow;
        }
        current[tokens[^1]] = value;
    }

    public static string Stringify(object? value) => value switch
    {
        null => "",
        string s => s,
        bool b => b ? "true" : "false",
        DateTime dt => dt.ToString("yyyy-MM-ddTHH:mm:ss.fff"),
        JsonValue jv => jv.ToString(),
        JsonNode jn => jn.ToJsonString(),
        IFormattable f => f.ToString(null, System.Globalization.CultureInfo.InvariantCulture) ?? "",
        Row or List<object?> => Core.Json.Serialize(value),
        _ => value.ToString() ?? "",
    };
}
