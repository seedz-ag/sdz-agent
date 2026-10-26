using Sdz.Agent.Services;
using Xunit;

namespace Sdz.Agent.Tests.Services;

public class InterpolationServiceTests
{
    private readonly InterpolationService _svc = new();

    [Fact]
    public void Replaces_scope_values_in_both_delimiters()
    {
        var scope = new Dictionary<string, object?> { ["page"] = 3, ["token"] = "abc" };
        Assert.Equal("p=3&t=abc", _svc.Interpolate("p={{page}}&t=<%=token%>", null, scope));
    }

    [Fact]
    public void Missing_key_without_alternative_becomes_empty()
    {
        Assert.Equal("x=", _svc.Interpolate("x={{nothing}}"));
    }

    [Fact]
    public void Alternative_text_is_used_when_key_is_missing()
    {
        Assert.Equal("x=10", _svc.Interpolate("x={{limit:10}}"));
    }

    [Fact]
    public void Date_modifiers_format_builtin_now()
    {
        var today = DateTime.Now.ToString("yyyy-MM-dd");
        var yesterday = DateTime.Now.AddDays(-1).ToString("dd/MM/yyyy");
        Assert.Equal(today, _svc.Interpolate("{{now|YYYY-MM-DD}}"));
        Assert.Equal(yesterday, _svc.Interpolate("{{yesterday|DD/MM/YYYY}}"));
        Assert.Equal(DateTime.Now.AddDays(-1).ToString("yyyyMMdd"), _svc.Interpolate("{{now|sub_day,YYYYMMDD}}"));
    }

    [Fact]
    public void Numeric_key_with_date_sub_day_uses_key_as_argument()
    {
        var expected = DateTime.Now.AddDays(-7).ToString("yyyy-MM-dd");
        Assert.Equal(expected, _svc.Interpolate("{{7|date_sub_day,YYYY-MM-DD}}"));
    }

    [Fact]
    public void Moment_modifier_parses_a_literal_date()
    {
        Assert.Equal("01/03/2026", _svc.Interpolate("{{2026-03-01|moment,DD/MM/YYYY}}"));
    }

    [Fact]
    public void String_modifiers_apply()
    {
        var scope = new Dictionary<string, object?> { ["name"] = "ana silva" };
        Assert.Equal("ANA SILVA", _svc.Interpolate("{{name|uppercase}}", null, scope));
        Assert.Equal("Ana Silva", _svc.Interpolate("{{name|title}}", null, scope));
    }

    [Fact]
    public void Dot_path_reads_nested_scope()
    {
        var scope = new Dictionary<string, object?> { ["range"] = new Row { ["current"] = new Row { ["value"] = 5 } } };
        Assert.Equal("5", _svc.Interpolate("{{range.current.value}}", null, scope));
    }

    [Fact]
    public void Page_modifier_increments_per_query()
    {
        _svc.SetPage(0);
        Assert.Equal("1", _svc.Interpolate("{{x|page}}"));
        Assert.Equal("2", _svc.Interpolate("{{x|page}}"));
        _svc.SetPage(0);
        Assert.Equal("1", _svc.Interpolate("{{x|page}}"));
    }

    [Fact]
    public void Data_overrides_scope()
    {
        var scope = new Dictionary<string, object?> { ["a"] = "scope" };
        var data = new Dictionary<string, object?> { ["a"] = "data" };
        Assert.Equal("data", _svc.Interpolate("{{a}}", data, scope));
    }
}
