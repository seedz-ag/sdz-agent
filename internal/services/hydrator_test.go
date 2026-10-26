package services

import (
	"testing"
	"time"

	"github.com/seedz-ag/sdz-agent-go/internal/api"
	"github.com/seedz-ag/sdz-agent-go/internal/core"
)

func row(kv ...any) *core.Row {
	r := core.NewRow()
	for i := 0; i+1 < len(kv); i += 2 {
		r.Set(kv[i].(string), kv[i+1])
	}
	return r
}

func TestFlattenUppercasesAndNests(t *testing.T) {
	h := NewHydrator()
	flat := h.Flatten(row("id", 1, "Customer", row("name", "Ana", "Address", row("city", "SP"))))
	if v, _ := flat.Get("ID"); v != 1 {
		t.Fatalf("ID = %v", v)
	}
	if v, _ := flat.Get("CUSTOMER.NAME"); v != "Ana" {
		t.Fatalf("CUSTOMER.NAME = %v", v)
	}
	if v, _ := flat.Get("CUSTOMER.ADDRESS.CITY"); v != "SP" {
		t.Fatalf("nested = %v", v)
	}
}

func TestFlattenArrayQuirk(t *testing.T) {
	flat := NewHydrator().Flatten(row("items", []any{row("sku", "A"), row("sku", "B")}))
	if v, _ := flat.Get("0.SKU"); v != "A" {
		t.Fatalf("0.SKU = %v", v)
	}
	if v, _ := flat.Get("1.SKU"); v != "B" {
		t.Fatalf("1.SKU = %v", v)
	}
}

func TestHydrateMapsAndPipes(t *testing.T) {
	h := NewHydrator()
	maps := []api.Map{
		{From: "cod_cliente", To: "CustomerId"},
		{From: "nome", To: "Name"},
		{From: "code", To: "Code|Prepend(BR-)|Append(-X)"},
		{From: "name", To: "Upper|Capitalize()"},
		{From: "", To: "Fixed|SetValue(abc)"},
		{From: "a", To: "Joined|Concat(b)"},
		{From: "missing", To: "Missing"},
		{From: "", To: "Id|UUID()"},
		{From: "", To: "Date|Now()"},
	}
	out := h.Hydrate(maps, row("COD_CLIENTE", "42", "NOME", "  Ana ", "CODE", "1", "NAME", "ana", "A", "x", "B", "y"))
	get := func(k string) any { v, _ := out.Get(k); return v }
	if get("CustomerId") != "42" || get("Name") != "  Ana " { // untrimmed unless a pipe runs, as in the Node agent
		t.Fatalf("basic map: %v %q", get("CustomerId"), get("Name"))
	}
	if get("Code") != "BR-1-X" || get("Upper") != "ANA" || get("Fixed") != "abc" || get("Joined") != "xy" || get("Missing") != "" {
		t.Fatalf("pipes: %v %v %v %v %v", get("Code"), get("Upper"), get("Fixed"), get("Joined"), get("Missing"))
	}
	if len(get("Id").(string)) != 36 || get("Date") != time.Now().Format("2006-01-02") {
		t.Fatalf("uuid/now: %v %v", get("Id"), get("Date"))
	}
}

func TestHydrateNestedFrom(t *testing.T) {
	out := NewHydrator().Hydrate([]api.Map{{From: "customer.address.city", To: "City"}}, row("customer", row("address", row("city", "Rio"))))
	if v, _ := out.Get("City"); v != "Rio" {
		t.Fatalf("City = %v", v)
	}
}

func TestHydrateKeepsDates(t *testing.T) {
	d := time.Date(2026, 10, 20, 8, 0, 0, 0, time.Local)
	out := NewHydrator().Hydrate([]api.Map{{From: "when", To: "When"}}, row("WHEN", d))
	if v, _ := out.Get("When"); v != d {
		t.Fatalf("When = %v", v)
	}
}
