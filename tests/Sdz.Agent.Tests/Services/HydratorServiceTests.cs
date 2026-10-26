using Sdz.Agent.Api;
using Sdz.Agent.Services;
using Xunit;

namespace Sdz.Agent.Tests.Services;

public class HydratorServiceTests
{
    private readonly HydratorService _hydrator = new();

    [Fact]
    public void Flatten_uppercases_keys_and_nests_objects_with_dots()
    {
        var row = new Row { ["id"] = 1, ["Customer"] = new Row { ["name"] = "Ana", ["Address"] = new Row { ["city"] = "SP" } } };
        var flat = _hydrator.Flatten(row);
        Assert.Equal(1, flat["ID"]);
        Assert.Equal("Ana", flat["CUSTOMER.NAME"]);
        Assert.Equal("SP", flat["CUSTOMER.ADDRESS.CITY"]);
    }

    [Fact]
    public void Flatten_keeps_node_quirk_for_arrays_indexed_without_parent_key()
    {
        var row = new Row { ["items"] = new List<object?> { new Row { ["sku"] = "A" }, new Row { ["sku"] = "B" } } };
        var flat = _hydrator.Flatten(row);
        Assert.Equal("A", flat["0.SKU"]);
        Assert.Equal("B", flat["1.SKU"]);
    }

    [Fact]
    public void Hydrate_maps_from_to_case_insensitively()
    {
        var maps = new List<Map> { new() { From = "cod_cliente", To = "CustomerId" }, new() { From = "nome", To = "Name" } };
        var result = _hydrator.Hydrate(maps, new Row { ["COD_CLIENTE"] = "42", ["NOME"] = "  Ana " });
        Assert.Equal("42", result["CustomerId"]);
        Assert.Equal("  Ana ", result["Name"]); // untrimmed unless a pipe runs, as in the Node agent
    }

    [Fact]
    public void Hydrate_missing_from_yields_empty_string()
    {
        var maps = new List<Map> { new() { From = "missing", To = "X" } };
        var result = _hydrator.Hydrate(maps, new Row { ["A"] = 1 });
        Assert.Equal("", result["X"]);
    }

    [Fact]
    public void Hydrate_applies_pipes_in_order()
    {
        var maps = new List<Map>
        {
            new() { From = "code", To = "Code|Prepend(BR-)|Append(-X)" },
            new() { From = "name", To = "Upper|Capitalize()" },
            new() { From = null, To = "Fixed|SetValue(abc)" },
            new() { From = "a", To = "Joined|Concat(b)" },
        };
        var result = _hydrator.Hydrate(maps, new Row { ["CODE"] = "1", ["NAME"] = "ana", ["A"] = "x", ["B"] = "y" });
        Assert.Equal("BR-1-X", result["Code"]);
        Assert.Equal("ANA", result["Upper"]);
        Assert.Equal("abc", result["Fixed"]);
        Assert.Equal("xy", result["Joined"]);
    }

    [Fact]
    public void Hydrate_uuid_and_now_pipes_generate_values()
    {
        var maps = new List<Map> { new() { From = null, To = "Id|UUID()" }, new() { From = null, To = "Date|Now()" } };
        var result = _hydrator.Hydrate(maps, new Row());
        Assert.True(Guid.TryParse(result["Id"]?.ToString(), out _));
        Assert.Equal(DateTime.Now.ToString("yyyy-MM-dd"), result["Date"]);
    }

    [Fact]
    public void Hydrate_nested_from_reads_through_dot_path()
    {
        var maps = new List<Map> { new() { From = "customer.address.city", To = "City" } };
        var row = new Row { ["customer"] = new Row { ["address"] = new Row { ["city"] = "Rio" } } };
        Assert.Equal("Rio", _hydrator.Hydrate(maps, row)["City"]);
    }

    [Fact]
    public void Hydrate_treats_dates_as_scalars()
    {
        var maps = new List<Map> { new() { From = "when", To = "When" } };
        var date = new DateTime(2026, 10, 20, 8, 0, 0);
        var value = _hydrator.Hydrate(maps, new Row { ["WHEN"] = date })["When"];
        Assert.Equal(date, value);
    }
}
