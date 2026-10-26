package core

import (
	"bytes"
	"encoding/json"
	"fmt"
	"strconv"
	"time"
)

// MarshalJSON serialises without HTML escaping (like JSON.stringify).
func MarshalJSON(v any, indent bool) ([]byte, error) {
	var buf bytes.Buffer
	enc := json.NewEncoder(&buf)
	enc.SetEscapeHTML(false)
	if indent {
		enc.SetIndent("", "  ")
	}
	if err := enc.Encode(v); err != nil {
		return nil, err
	}
	return bytes.TrimRight(buf.Bytes(), "\n"), nil
}

func MustJSON(v any) string {
	b, err := MarshalJSON(v, false)
	if err != nil {
		return fmt.Sprintf("%v", v)
	}
	return string(b)
}

// Stringify renders a value the way the agent logs/interpolates it.
func Stringify(v any) string {
	switch t := v.(type) {
	case nil:
		return ""
	case string:
		return t
	case bool:
		if t {
			return "true"
		}
		return "false"
	case json.Number:
		return t.String()
	case int:
		return strconv.Itoa(t)
	case int64:
		return strconv.FormatInt(t, 10)
	case float64:
		return strconv.FormatFloat(t, 'f', -1, 64)
	case DateOnly:
		return time.Time(t).Format("2006-01-02")
	case UTCTime:
		return time.Time(t).UTC().Format(TimeLayout) + "Z"
	case time.Time:
		return t.Format("2006-01-02T15:04:05.000")
	case error:
		return t.Error()
	case *Row, []any, map[string]any:
		return MustJSON(t)
	default:
		return fmt.Sprintf("%v", t)
	}
}

// Truthy mirrors JavaScript truthiness for the few cases the agent relies on.
func Truthy(v any) bool {
	switch t := v.(type) {
	case nil:
		return false
	case string:
		return t != ""
	case bool:
		return t
	case json.Number:
		f, _ := t.Float64()
		return f != 0
	case int:
		return t != 0
	case int64:
		return t != 0
	case float64:
		return t != 0
	default:
		return true
	}
}
