package services

import (
	"encoding/json"
	"strconv"
	"strings"

	"github.com/seedz-ag/sdz-agent-go/internal/core"
)

// Get reads a dotted path over *core.Row / []any (dot-wild subset used by the Node agent).
// A literal key containing dots wins over the path walk; "*" projects over every element.
func Get(root any, path string, fallback any) any {
	if root == nil || path == "" {
		return fallback
	}
	if row, ok := root.(*core.Row); ok {
		if v, ok := row.Get(path); ok && v != nil {
			return v
		}
	}
	current := root
	for _, raw := range strings.Split(path, ".") {
		if current == nil {
			return fallback
		}
		token, index := raw, ""
		if open := strings.Index(token, "["); open >= 0 && strings.HasSuffix(token, "]") {
			index = token[open+1 : len(token)-1]
			token = token[:open]
		}
		if token == "*" {
			current = children(current)
			continue
		}
		if list, ok := current.([]any); ok && token != "" {
			if _, err := strconv.Atoi(token); err != nil {
				projected := []any{}
				for _, el := range list {
					v := step(el, token)
					if inner, ok := v.([]any); ok {
						projected = append(projected, inner...)
					} else if v != nil {
						projected = append(projected, v)
					}
				}
				current = projected
			} else {
				current = step(current, token)
			}
		} else if token != "" {
			current = step(current, token)
		}
		if index != "" && current != nil {
			current = step(current, index)
		}
	}
	if current == nil {
		return fallback
	}
	return current
}

func children(v any) []any {
	switch t := v.(type) {
	case []any:
		return t
	case *core.Row:
		out := make([]any, 0, t.Len())
		for _, k := range t.Keys() {
			x, _ := t.Get(k)
			out = append(out, x)
		}
		return out
	case map[string]any:
		out := make([]any, 0, len(t))
		for _, x := range t {
			out = append(out, x)
		}
		return out
	}
	return nil
}

func step(current any, token string) any {
	switch t := current.(type) {
	case *core.Row:
		if v, ok := t.GetFold(token); ok {
			return v
		}
		return nil
	case map[string]any:
		if v, ok := t[token]; ok {
			return v
		}
		for k, v := range t {
			if strings.EqualFold(k, token) {
				return v
			}
		}
		return nil
	case map[string]string:
		return t[token]
	case []any:
		if n, err := strconv.Atoi(token); err == nil && n >= 0 && n < len(t) {
			return t[n]
		}
		return nil
	}
	return nil
}

// Set writes a dotted path creating intermediate rows (dot-wild set).
func Set(root *core.Row, path string, value any) {
	tokens := strings.Split(path, ".")
	current := root
	for _, t := range tokens[:len(tokens)-1] {
		next, ok := current.Get(t)
		row, isRow := next.(*core.Row)
		if !ok || !isRow {
			row = core.NewRow()
			current.Set(t, row)
		}
		current = row
	}
	current.Set(tokens[len(tokens)-1], value)
}

// Stringify renders values the way templates and pipes see them.
func Stringify(v any) string {
	switch t := v.(type) {
	case json.Number:
		return t.String()
	default:
		return core.Stringify(v)
	}
}
