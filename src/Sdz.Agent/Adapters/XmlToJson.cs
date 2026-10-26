using System.Xml;
using System.Xml.Linq;

namespace Sdz.Agent.Adapters;

/// <summary>
/// Approximation of xml2json's toJson(..., {object:true}): elements become keys,
/// attributes become keys, text of mixed elements goes to "$t", repeated siblings
/// become lists and text-only elements become strings.
/// </summary>
public static class XmlToJson
{
    public static Row Convert(string xml)
    {
        var doc = XDocument.Parse(xml, LoadOptions.None);
        var root = new Row();
        if (doc.Root is not null) root[Name(doc.Root)] = ConvertElement(doc.Root);
        return root;
    }

    public static object? ConvertElement(XElement element)
    {
        var hasChildren = element.HasElements;
        var hasAttributes = element.HasAttributes;
        var text = string.Concat(element.Nodes().OfType<XText>().Select(t => t.Value)).Trim();

        if (!hasChildren && !hasAttributes) return text;

        var row = new Row();
        foreach (var attribute in element.Attributes())
        {
            if (attribute.IsNamespaceDeclaration) continue;
            row[Name(attribute)] = attribute.Value;
        }

        foreach (var group in element.Elements().GroupBy(Name))
        {
            var items = group.Select(ConvertElement).ToList();
            row[group.Key] = items.Count == 1 ? items[0] : items;
        }

        if (text.Length > 0) row["$t"] = text;
        return row;
    }

    private static string Name(XElement e) => e.Name.Namespace == XNamespace.None || string.IsNullOrEmpty(e.GetPrefixOfNamespace(e.Name.Namespace))
        ? e.Name.LocalName
        : $"{e.GetPrefixOfNamespace(e.Name.Namespace)}:{e.Name.LocalName}";

    private static string Name(XAttribute a) => a.Name.Namespace == XNamespace.None || string.IsNullOrEmpty(a.Parent?.GetPrefixOfNamespace(a.Name.Namespace))
        ? a.Name.LocalName
        : $"{a.Parent!.GetPrefixOfNamespace(a.Name.Namespace)}:{a.Name.LocalName}";

    /// <summary>
    /// Streams an Atom/OData feed and yields one Row per &lt;entry&gt;, flattening
    /// content/m:properties children (upper-cased keys) plus the entry's own
    /// children (id, title, updated...). Port of HttpConsumer.convertEntryToObject.
    /// </summary>
    public static async IAsyncEnumerable<Row> StreamEntriesAsync(Stream stream, [System.Runtime.CompilerServices.EnumeratorCancellation] CancellationToken ct = default)
    {
        var settings = new XmlReaderSettings { Async = true, IgnoreWhitespace = true, DtdProcessing = DtdProcessing.Ignore };
        using var reader = XmlReader.Create(stream, settings);

        while (await reader.ReadAsync().ConfigureAwait(false))
        {
            ct.ThrowIfCancellationRequested();
            if (reader.NodeType != XmlNodeType.Element || reader.LocalName != "entry") continue;

            var entry = (XElement)XNode.ReadFrom(reader);
            yield return ConvertEntry(entry);
        }
    }

    public static Row ConvertEntry(XElement entry)
    {
        var result = new Row();

        var content = entry.Elements().FirstOrDefault(e => e.Name.LocalName == "content");
        var properties = content?.Elements().FirstOrDefault(e => e.Name.LocalName == "properties");
        if (properties is not null)
        {
            foreach (var property in properties.Elements())
            {
                result[property.Name.LocalName.ToUpperInvariant()] = property.HasElements
                    ? ConvertElement(property)
                    : (object?)property.Value;
            }
        }

        foreach (var child in entry.Elements())
        {
            if (child.Name.LocalName == "content") continue;
            var key = child.Name.LocalName.ToUpperInvariant();
            if (result.ContainsKey(key)) continue;
            result[key] = child.HasElements ? ConvertElement(child) : child.Value;
        }

        return result;
    }
}
