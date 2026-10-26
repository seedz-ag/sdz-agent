using System.Text.Encodings.Web;
using System.Text.Json;
using System.Text.Json.Nodes;
using System.Text.Json.Serialization;

namespace Sdz.Agent.Core;

public static class Json
{
    public static readonly JsonSerializerOptions Options = new()
    {
        PropertyNameCaseInsensitive = true,
        DefaultIgnoreCondition = JsonIgnoreCondition.Never,
        Encoder = JavaScriptEncoder.UnsafeRelaxedJsonEscaping,
        NumberHandling = JsonNumberHandling.AllowReadingFromString,
        Converters = { new DbValueConverter(), new JsonStringEnumConverter() },
    };

    public static readonly JsonSerializerOptions Indented = new(Options) { WriteIndented = true };

    public static string Serialize<T>(T value, bool indented = false) =>
        JsonSerializer.Serialize(value, indented ? Indented : Options);

    public static T? Deserialize<T>(string json) => JsonSerializer.Deserialize<T>(json, Options);

    public static JsonNode? Parse(string json) => JsonNode.Parse(json, documentOptions: new JsonDocumentOptions { AllowTrailingCommas = true });

    /// <summary>Converts a JsonNode tree into plain CLR objects (Row / List / primitives).</summary>
    public static object? ToClr(JsonNode? node)
    {
        switch (node)
        {
            case null: return null;
            case JsonObject obj:
                var row = new Row();
                foreach (var (k, v) in obj) row[k] = ToClr(v);
                return row;
            case JsonArray arr:
                return arr.Select(ToClr).ToList();
            case JsonValue val:
                if (val.TryGetValue<string>(out var s)) return s;
                if (val.TryGetValue<bool>(out var b)) return b;
                if (val.TryGetValue<long>(out var l)) return l;
                if (val.TryGetValue<double>(out var d)) return d;
                if (val.TryGetValue<decimal>(out var m)) return m;
                return val.ToJsonString();
            default:
                return node.ToJsonString();
        }
    }

    public static JsonNode? ToNode(object? value) => value is null ? null : JsonSerializer.SerializeToNode(value, Options);

    /// <summary>Serializes DB-originated values the way JSON.stringify did for the Node drivers.</summary>
    private sealed class DbValueConverter : JsonConverter<object>
    {
        public override bool CanConvert(Type typeToConvert) => typeToConvert == typeof(object);

        public override object? Read(ref Utf8JsonReader reader, Type typeToConvert, JsonSerializerOptions options)
        {
            using var doc = JsonDocument.ParseValue(ref reader);
            return ToClr(JsonNode.Parse(doc.RootElement.GetRawText()));
        }

        public override void Write(Utf8JsonWriter writer, object value, JsonSerializerOptions options)
        {
            switch (value)
            {
                case DBNull: writer.WriteNullValue(); break;
                // shortest form (4599.0 -> 4599, 12.50 -> 12.5): same JSON whatever the driver's numeric type (parity with the Go port)
                case decimal m: writer.WriteNumberValue(m / 1.000000000000000000000000000000m); break;
                case DateTime dt: writer.WriteStringValue(dt.Kind == DateTimeKind.Utc ? dt.ToString("yyyy-MM-ddTHH:mm:ss.fffZ") : dt.ToString("yyyy-MM-ddTHH:mm:ss.fff")); break;
                case DateTimeOffset dto: writer.WriteStringValue(dto.ToString("yyyy-MM-ddTHH:mm:ss.fffzzz")); break;
                case DateOnly d: writer.WriteStringValue(d.ToString("yyyy-MM-dd")); break;
                case TimeOnly t: writer.WriteStringValue(t.ToString("HH:mm:ss")); break;
                case TimeSpan ts: writer.WriteStringValue(ts.ToString()); break;
                case byte[] bytes: writer.WriteStringValue(Convert.ToBase64String(bytes)); break;
                case Guid g: writer.WriteStringValue(g.ToString()); break;
                case char c: writer.WriteStringValue(c.ToString()); break;
                case JsonNode node: node.WriteTo(writer, options); break;
                default:
                    JsonSerializer.Serialize(writer, value, value.GetType(), options);
                    break;
            }
        }
    }
}
