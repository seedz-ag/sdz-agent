package services

import (
	"testing"
	"time"

	"github.com/seedz-ag/sdz-agent-go/internal/core"
)

func TestInterpolateScopeAndDelimiters(t *testing.T) {
	i := NewInterpolation()
	got := i.Interpolate("p={{page}}&t=<%=token%>", nil, map[string]any{"page": 3, "token": "abc"})
	if got != "p=3&t=abc" {
		t.Fatal(got)
	}
	if i.Interpolate("x={{nothing}}", nil, nil) != "x=" {
		t.Fatal("missing key")
	}
	if i.Interpolate("x={{limit:10}}", nil, nil) != "x=10" {
		t.Fatal("alternative")
	}
}

func TestInterpolateDateModifiers(t *testing.T) {
	i := NewInterpolation()
	today := time.Now().Format("2006-01-02")
	if got := i.Interpolate("{{now|YYYY-MM-DD}}", nil, nil); got != today {
		t.Fatal(got)
	}
	if got := i.Interpolate("{{yesterday|DD/MM/YYYY}}", nil, nil); got != time.Now().AddDate(0, 0, -1).Format("02/01/2006") {
		t.Fatal(got)
	}
	if got := i.Interpolate("{{now|sub_day,YYYYMMDD}}", nil, nil); got != time.Now().AddDate(0, 0, -1).Format("20060102") {
		t.Fatal(got)
	}
	if got := i.Interpolate("{{7|date_sub_day,YYYY-MM-DD}}", nil, nil); got != time.Now().AddDate(0, 0, -7).Format("2006-01-02") {
		t.Fatal(got)
	}
	if got := i.Interpolate("{{2026-03-01|moment,DD/MM/YYYY}}", nil, nil); got != "01/03/2026" {
		t.Fatal(got)
	}
}

func TestInterpolateStringsPathsAndPage(t *testing.T) {
	i := NewInterpolation()
	scope := map[string]any{"name": "ana silva", "range": row("current", row("value", 5))}
	if i.Interpolate("{{name|uppercase}}", nil, scope) != "ANA SILVA" || i.Interpolate("{{name|title}}", nil, scope) != "Ana Silva" {
		t.Fatal("string modifiers")
	}
	if got := i.Interpolate("{{range.current.value}}", nil, scope); got != "5" {
		t.Fatal(got)
	}
	i.SetPage(0)
	if i.Interpolate("{{x|page}}", nil, nil) != "1" || i.Interpolate("{{x|page}}", nil, nil) != "2" {
		t.Fatal("page")
	}
	if i.Interpolate("{{a}}", map[string]any{"a": "data"}, map[string]any{"a": "scope"}) != "data" {
		t.Fatal("data overrides scope")
	}
	_ = core.Version
}
