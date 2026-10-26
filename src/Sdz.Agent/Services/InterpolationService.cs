using System.Globalization;
using System.Text.RegularExpressions;

namespace Sdz.Agent.Services;

/// <summary>moment-like value used by the interpolation modifiers.</summary>
public sealed class MomentValue
{
    public DateTime Value { get; }
    public MomentValue(DateTime value) => Value = value;

    public MomentValue Subtract(int amount, string unit) => unit switch
    {
        "d" or "day" or "days" => new MomentValue(Value.AddDays(-amount)),
        "month" or "months" or "M" => new MomentValue(Value.AddMonths(-amount)),
        "year" or "years" or "y" => new MomentValue(Value.AddYears(-amount)),
        "h" or "hour" or "hours" => new MomentValue(Value.AddHours(-amount)),
        _ => this,
    };

    public MomentValue Add(int amount, string unit) => Subtract(-amount, unit);

    /// <summary>Formats using moment.js tokens (YYYY, MM, DD, HH, mm, ss, and literal text).</summary>
    public string Format(string momentFormat)
    {
        var net = momentFormat
            .Replace("YYYY", "yyyy").Replace("YY", "yy")
            .Replace("DD", "dd").Replace("D", "d")
            .Replace("hh", "hh").Replace("HH", "HH")
            .Replace("SSS", "fff");
        return Value.ToString(net, CultureInfo.InvariantCulture);
    }

    public static MomentValue? Parse(string text)
    {
        if (DateTime.TryParseExact(text, new[] { "yyyy-MM-dd", "dd/MM/yyyy", "yyyy-MM-ddTHH:mm:ss", "yyyy-MM-dd HH:mm:ss" },
                CultureInfo.InvariantCulture, DateTimeStyles.AssumeLocal, out var dt))
        {
            return new MomentValue(dt);
        }
        return DateTime.TryParse(text, CultureInfo.InvariantCulture, DateTimeStyles.AssumeLocal, out dt) ? new MomentValue(dt) : null;
    }

    public override string ToString() => Value.ToString("yyyy-MM-ddTHH:mm:sszzz", CultureInfo.InvariantCulture);
}

/// <summary>
/// Port of InterpolationService / Interpolator: resolves "{{key:alt|mod1,mod2}}" and
/// "&lt;%= key %&gt;" templates against a data bag (now/tomorrow/yesterday + scope + data).
/// </summary>
public sealed class InterpolationService
{
    private static readonly (string Start, string End)[] Delimiters =
    {
        ("<%=", "%>"),
        ("{{", "}}"),
        ("{{ ", " }}"),
    };

    private readonly Dictionary<string, Func<object?, IDictionary<string, object?>, object?>> _modifiers = new(StringComparer.OrdinalIgnoreCase);
    private int _page;

    public InterpolationService()
    {
        Register("uppercase", (v, _) => PathValue.Stringify(v).ToUpperInvariant());
        Register("lowercase", (v, _) => PathValue.Stringify(v).ToLowerInvariant());
        Register("title", (v, _) => Regex.Replace(PathValue.Stringify(v), @"\w\S*", m => char.ToUpperInvariant(m.Value[0]) + m.Value[1..].ToLowerInvariant()));
        Register("moment", (v, data) =>
        {
            var text = PathValue.Stringify(v);
            if (Regex.IsMatch(text, @"(\d{4}-\d{2}-\d{2}|\d{2}/\d{2}/\d{4})")) return MomentValue.Parse(text) ?? v;
            // data.env[val] in Node (normally undefined → modifier fails and value stays)
            return data.TryGetValue("env", out var env) && PathValue.Get(env, text) is { } found ? MomentValue.Parse(PathValue.Stringify(found)) ?? v : v;
        });
        Register("sub_day", (v, _) => AsMoment(v)?.Subtract(1, "d") ?? v);
        Register("subDay", (v, _) => AsMoment(v)?.Subtract(1, "d") ?? v);
        Register("DDMMYYYY", (v, _) => AsMoment(v)?.Format("DDMMYYYY") ?? v);
        Register("DD/MM/YYYY", (v, _) => AsMoment(v)?.Format("DD/MM/YYYY") ?? v);
        Register("YYYY-MM-DD", (v, _) => AsMoment(v)?.Format("YYYY-MM-DD") ?? v);
        Register("YYYYMMDD", (v, _) => AsMoment(v)?.Format("YYYYMMDD") ?? v);
        Register("date_sub_day", (v, _) => new MomentValue(DateTime.Now).Subtract(ToInt(v), "day"));
        Register("date_sub_month", (v, _) => new MomentValue(DateTime.Now).Subtract(ToInt(v), "month"));
        Register("page", (v, _) =>
        {
            _page += int.TryParse(PathValue.Stringify(v), out var n) && n != 0 ? n : 1;
            return _page;
        });
    }

    public void SetPage(int value) => _page = value;

    public void Register(string key, Func<object?, IDictionary<string, object?>, object?> transform) => _modifiers[key] = transform;

    public string Interpolate(string template, IDictionary<string, object?>? data = null, IDictionary<string, object?>? scope = null)
    {
        var now = new MomentValue(DateTime.Now);
        var bag = new Dictionary<string, object?>(StringComparer.Ordinal)
        {
            ["now"] = now, ["NOW"] = now,
            ["tomorrow"] = now.Add(1, "d"), ["TOMORROW"] = now.Add(1, "d"),
            ["yesterday"] = now.Subtract(1, "d"), ["YESTERDAY"] = now.Subtract(1, "d"),
        };
        if (scope is not null) foreach (var (k, v) in scope) bag[k] = v;
        if (data is not null) foreach (var (k, v) in data) bag[k] = v;
        return Parse(template ?? "", bag);
    }

    private string Parse(string str, IDictionary<string, object?> data)
    {
        foreach (var (start, end) in Delimiters)
        {
            var regex = new Regex($"{Regex.Escape(start)}([^}}]+?){Regex.Escape(end)}", RegexOptions.IgnoreCase);
            var matches = regex.Matches(str);
            if (matches.Count == 0) continue;
            foreach (Match match in matches)
            {
                str = ApplyRule(str, match.Value, match.Groups[1].Value, data);
            }
        }
        return str;
    }

    private string ApplyRule(string str, string replace, string inner, IDictionary<string, object?> data)
    {
        var key = inner;
        var alternative = "";
        var modifiers = new List<string>();

        var colon = inner.IndexOf(':');
        var pipe = inner.IndexOf('|');
        if (pipe > 0)
        {
            modifiers = inner[(pipe + 1)..].Split(',').Select(m => m.Trim()).ToList();
            inner = inner[..pipe];
            colon = inner.IndexOf(':');
        }
        if (colon > 0)
        {
            alternative = inner[(colon + 1)..];
            key = inner[..colon];
        }
        else
        {
            key = inner;
        }
        key = key.Trim();

        var value = ApplyData(key, data);
        if (IsTruthy(value))
        {
            return ReplaceFirst(str, replace, PathValue.Stringify(ApplyModifiers(modifiers, value, data)));
        }
        if (alternative.Length > 0)
        {
            return ReplaceFirst(str, replace, PathValue.Stringify(ApplyModifiers(modifiers, alternative, data)));
        }
        var defaultModifier = ApplyModifiers(modifiers, key, data);
        if (defaultModifier is string s && s == key)
        {
            return ReplaceFirst(str, replace, "");
        }
        return ReplaceFirst(str, replace, PathValue.Stringify(defaultModifier));
    }

    private static object? ApplyData(string key, IDictionary<string, object?> data)
    {
        if (key.Contains('.') || key.Contains('['))
        {
            return PathValue.Get(new Row(data), key, "");
        }
        return data.TryGetValue(key, out var value) ? value : null;
    }

    private object? ApplyModifiers(IEnumerable<string> modifiers, object? value, IDictionary<string, object?> data)
    {
        try
        {
            foreach (var name in modifiers)
            {
                if (name.Length == 0) continue;
                if (_modifiers.TryGetValue(name, out var transform)) value = transform(value, data);
            }
            return value;
        }
        catch
        {
            return value;
        }
    }

    private static bool IsTruthy(object? value) => value switch
    {
        null => false,
        string s => s.Length > 0,
        bool b => b,
        int i => i != 0,
        long l => l != 0,
        double d => d != 0,
        decimal m => m != 0,
        _ => true,
    };

    private static MomentValue? AsMoment(object? value) => value switch
    {
        MomentValue m => m,
        DateTime dt => new MomentValue(dt),
        string s => MomentValue.Parse(s),
        _ => null,
    };

    private static int ToInt(object? value) => int.TryParse(PathValue.Stringify(value), out var n) ? n : 0;

    private static string ReplaceFirst(string str, string search, string replacement)
    {
        var idx = str.IndexOf(search, StringComparison.Ordinal);
        return idx < 0 ? str : string.Concat(str.AsSpan(0, idx), replacement, str.AsSpan(idx + search.Length));
    }
}
