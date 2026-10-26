package services

import (
	"strings"
	"time"

	"github.com/google/uuid"
	"github.com/seedz-ag/sdz-agent-go/internal/api"
	"github.com/seedz-ag/sdz-agent-go/internal/core"
)

type pipeFunc func(row *core.Row, value any, args []string) any

func arg(args []string, i int) string {
	if i < len(args) {
		return args[i]
	}
	return ""
}

var pipes = map[string]pipeFunc{
	"Append":     func(_ *core.Row, v any, a []string) any { return Stringify(v) + arg(a, 0) },
	"Capitalize": func(_ *core.Row, v any, _ []string) any { if s, ok := v.(string); ok { return strings.ToUpper(s) }; return false },
	"Concat": func(row *core.Row, v any, a []string) any {
		return Stringify(v) + Stringify(Get(row, strings.ToUpper(arg(a, 0)), ""))
	},
	"Now":      func(_ *core.Row, _ any, _ []string) any { return time.Now().Format("2006-01-02") },
	"Prepend":  func(_ *core.Row, v any, a []string) any { return arg(a, 0) + Stringify(v) },
	"SetValue": func(_ *core.Row, _ any, a []string) any { return arg(a, 0) },
	"UUID":     func(_ *core.Row, _ any, _ []string) any { return uuid.NewString() },
}

// Hydrator applies a schema's Maps (From → To with "|Pipe(arg)" transforms) to a raw row.
type Hydrator struct{}

func NewHydrator() *Hydrator { return &Hydrator{} }

// Flatten upper-cases keys, joins nested objects with dots and keeps the Node quirk for arrays (index only).
func (h *Hydrator) Flatten(obj any) *core.Row {
	result := core.NewRow()
	flattenInto(obj, result)
	return result
}

func flattenInto(obj any, result *core.Row) {
	switch t := obj.(type) {
	case *core.Row:
		for _, key := range t.Keys() {
			value, _ := t.Get(key)
			switch v := value.(type) {
			case []any:
				for j, item := range v {
					temp := core.NewRow()
					flattenInto(item, temp)
					for _, k := range temp.Keys() {
						x, _ := temp.Get(k)
						result.Set(Stringify(j)+"."+k, x)
					}
				}
			case *core.Row, map[string]any:
				temp := core.NewRow()
				flattenInto(v, temp)
				for _, k := range temp.Keys() {
					x, _ := temp.Get(k)
					result.Set(strings.ToUpper(key)+"."+strings.ToUpper(k), x)
				}
			default:
				result.Set(strings.ToUpper(key), value)
			}
		}
	case map[string]any:
		row := core.NewRow()
		for k, v := range t {
			row.Set(k, v)
		}
		flattenInto(row, result)
	}
}

func (h *Hydrator) Hydrate(mapping []api.Map, row *core.Row) *core.Row {
	hydrated := core.NewRow()
	flattened := h.Flatten(row)
	normalized := core.NewRow()
	for _, k := range flattened.Keys() {
		v, _ := flattened.Get(k)
		Set(normalized, k, v)
	}
	for _, m := range mapping {
		from, to := m.From, m.To
		var value any = ""
		if from != "" {
			if raw, ok := flattened.Get(strings.ToUpper(from)); ok {
				value = strings.TrimSpace(Stringify(raw))
			}
		}
		if strings.Contains(to, "|") {
			parts := strings.Split(to, "|")
			to = parts[0]
			for _, segment := range parts[1:] {
				open := strings.Index(segment, "(")
				close := strings.LastIndex(segment, ")")
				if open < 0 || close < open {
					continue
				}
				fn, ok := pipes[segment[:open]]
				if !ok {
					continue
				}
				args := strings.Split(segment[open+1:close], ",")
				value = fn(normalized, value, args)
				key := to
				if from != "" {
					key = from
				}
				normalized.Set(strings.ToUpper(key), value)
			}
		}
		key := to
		if from != "" {
			key = from
		}
		hydrated.Set(to, Get(normalized, strings.ToUpper(key), ""))
	}
	return hydrated
}
