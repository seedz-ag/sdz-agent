package core

import (
	"bytes"
	"encoding/json"
	"sort"
	"strings"
	"time"
)

// TimeLayout is how DB timestamps are serialised (same as the .NET port: local time, no offset).
const TimeLayout = "2006-01-02T15:04:05.000"

// DateOnly is a DATE column (no time of day): serialised as "2006-01-02", like DateOnly in the .NET port.
type DateOnly time.Time

// UTCTime is an instant known to be UTC (Mongo dates, timestamptz): serialised with a trailing "Z",
// like DateTimeKind.Utc in the .NET port.
type UTCTime time.Time

// NormalizeNumber strips a redundant fractional part ("4599.0" -> "4599", "12.50" -> "12.5") so both
// ports emit the same JSON whatever the driver's native numeric type was.
func NormalizeNumber(s string) string {
	if !strings.Contains(s, ".") || strings.ContainsAny(s, "eE") {
		return s
	}
	s = strings.TrimRight(s, "0")
	s = strings.TrimSuffix(s, ".")
	if s == "" || s == "-" {
		return "0"
	}
	return s
}

// encodeValue marshals a value the way the agent writes rows: time.Time with TimeLayout,
// nested rows/lists recursively, everything else through encoding/json.
func encodeValue(v any) ([]byte, error) {
	switch t := v.(type) {
	case DateOnly:
		return json.Marshal(time.Time(t).Format("2006-01-02"))
	case UTCTime:
		return json.Marshal(time.Time(t).UTC().Format(TimeLayout) + "Z")
	case time.Time:
		return json.Marshal(t.Format(TimeLayout))
	case *time.Time:
		if t == nil {
			return []byte("null"), nil
		}
		return json.Marshal(t.Format(TimeLayout))
	case []any:
		var buf bytes.Buffer
		buf.WriteByte('[')
		for i, item := range t {
			if i > 0 {
				buf.WriteByte(',')
			}
			b, err := encodeValue(item)
			if err != nil {
				return nil, err
			}
			buf.Write(b)
		}
		buf.WriteByte(']')
		return buf.Bytes(), nil
	default:
		return json.Marshal(v)
	}
}

// Row is an insertion-ordered map, so JSON output keeps the column order the
// database returned (what JSON.stringify did for the Node agent).
type Row struct {
	keys []string
	m    map[string]any
}

func NewRow() *Row { return &Row{m: map[string]any{}} }

func (r *Row) Set(key string, value any) {
	if r.m == nil {
		r.m = map[string]any{}
	}
	if _, ok := r.m[key]; !ok {
		r.keys = append(r.keys, key)
	}
	r.m[key] = value
}

func (r *Row) Get(key string) (any, bool) {
	if r == nil || r.m == nil {
		return nil, false
	}
	v, ok := r.m[key]
	return v, ok
}

// GetFold finds a key ignoring case (exact match wins).
func (r *Row) GetFold(key string) (any, bool) {
	if v, ok := r.Get(key); ok {
		return v, true
	}
	for _, k := range r.keys {
		if equalFold(k, key) {
			return r.m[k], true
		}
	}
	return nil, false
}

func (r *Row) Delete(key string) {
	if _, ok := r.m[key]; !ok {
		return
	}
	delete(r.m, key)
	for i, k := range r.keys {
		if k == key {
			r.keys = append(r.keys[:i], r.keys[i+1:]...)
			break
		}
	}
}

func (r *Row) Keys() []string {
	if r == nil {
		return nil
	}
	out := make([]string, len(r.keys))
	copy(out, r.keys)
	return out
}

func (r *Row) Len() int {
	if r == nil {
		return 0
	}
	return len(r.keys)
}

func (r *Row) Clone() *Row {
	c := NewRow()
	for _, k := range r.keys {
		c.Set(k, r.m[k])
	}
	return c
}

func (r *Row) MarshalJSON() ([]byte, error) {
	var buf bytes.Buffer
	buf.WriteByte('{')
	for i, k := range r.keys {
		if i > 0 {
			buf.WriteByte(',')
		}
		kb, _ := json.Marshal(k)
		buf.Write(kb)
		buf.WriteByte(':')
		vb, err := encodeValue(r.m[k])
		if err != nil {
			return nil, err
		}
		buf.Write(vb)
	}
	buf.WriteByte('}')
	return buf.Bytes(), nil
}

func (r *Row) UnmarshalJSON(data []byte) error {
	dec := json.NewDecoder(bytes.NewReader(data))
	dec.UseNumber()
	v, err := decodeOrdered(dec)
	if err != nil {
		return err
	}
	row, ok := v.(*Row)
	if !ok {
		return &json.UnmarshalTypeError{Value: "non-object", Type: nil}
	}
	*r = *row
	return nil
}

// ParseJSON decodes JSON keeping object key order (*Row), arrays as []any, numbers as json.Number.
func ParseJSON(data []byte) (any, error) {
	dec := json.NewDecoder(bytes.NewReader(data))
	dec.UseNumber()
	return decodeOrdered(dec)
}

func decodeOrdered(dec *json.Decoder) (any, error) {
	tok, err := dec.Token()
	if err != nil {
		return nil, err
	}
	switch t := tok.(type) {
	case json.Delim:
		switch t {
		case '{':
			row := NewRow()
			for dec.More() {
				kt, err := dec.Token()
				if err != nil {
					return nil, err
				}
				key, _ := kt.(string)
				val, err := decodeOrdered(dec)
				if err != nil {
					return nil, err
				}
				row.Set(key, val)
			}
			_, err := dec.Token() // '}'
			return row, err
		case '[':
			arr := []any{}
			for dec.More() {
				val, err := decodeOrdered(dec)
				if err != nil {
					return nil, err
				}
				arr = append(arr, val)
			}
			_, err := dec.Token() // ']'
			return arr, err
		}
	}
	return tok, nil
}

// SortedKeys is a helper for deterministic output in tests.
func (r *Row) SortedKeys() []string {
	k := r.Keys()
	sort.Strings(k)
	return k
}

func equalFold(a, b string) bool {
	if len(a) != len(b) {
		return false
	}
	for i := 0; i < len(a); i++ {
		ca, cb := a[i], b[i]
		if ca >= 'A' && ca <= 'Z' {
			ca += 'a' - 'A'
		}
		if cb >= 'A' && cb <= 'Z' {
			cb += 'a' - 'A'
		}
		if ca != cb {
			return false
		}
	}
	return true
}
