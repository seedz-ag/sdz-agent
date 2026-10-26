package services

import (
	"regexp"
	"strconv"
	"strings"
	"sync"
	"time"

	"github.com/seedz-ag/sdz-agent-go/internal/core"
)

// Moment is the moment.js-like value used by the template modifiers.
type Moment struct{ T time.Time }

func (m Moment) Subtract(n int, unit string) Moment {
	switch unit {
	case "d", "day", "days":
		return Moment{m.T.AddDate(0, 0, -n)}
	case "month", "months", "M":
		return Moment{m.T.AddDate(0, -n, 0)}
	case "year", "years", "y":
		return Moment{m.T.AddDate(-n, 0, 0)}
	case "h", "hour", "hours":
		return Moment{m.T.Add(-time.Duration(n) * time.Hour)}
	}
	return m
}

func (m Moment) Add(n int, unit string) Moment { return m.Subtract(-n, unit) }

// Format converts moment tokens (YYYY, MM, DD, HH, mm, ss) to a Go layout.
func (m Moment) Format(momentFormat string) string {
	r := strings.NewReplacer("YYYY", "2006", "YY", "06", "MM", "01", "DD", "02", "HH", "15", "hh", "03", "mm", "04", "ss", "05", "SSS", "000")
	return m.T.Format(r.Replace(momentFormat))
}

func (m Moment) String() string { return m.T.Format("2006-01-02T15:04:05-07:00") }

func ParseMoment(text string) (Moment, bool) {
	for _, layout := range []string{"2006-01-02", "02/01/2006", "2006-01-02T15:04:05", "2006-01-02 15:04:05", time.RFC3339} {
		if t, err := time.ParseInLocation(layout, text, time.Local); err == nil {
			return Moment{t}, true
		}
	}
	return Moment{}, false
}

func asMoment(v any) (Moment, bool) {
	switch t := v.(type) {
	case Moment:
		return t, true
	case time.Time:
		return Moment{t}, true
	case core.DateOnly:
		return Moment{time.Time(t)}, true
	case core.UTCTime:
		return Moment{time.Time(t)}, true
	case string:
		return ParseMoment(t)
	}
	return Moment{}, false
}

type modifier func(value any, data map[string]any) any

// Interpolation resolves "{{key:alt|mod1,mod2}}" and "<%= key %>" templates (port of InterpolationService).
type Interpolation struct {
	mu        sync.Mutex
	page      int
	modifiers map[string]modifier
}

var delimiters = [][2]string{{"<%=", "%>"}, {"{{", "}}"}, {"{{ ", " }}"}}
var dateRe = regexp.MustCompile(`(\d{4}-\d{2}-\d{2}|\d{2}/\d{2}/\d{4})`)
var titleRe = regexp.MustCompile(`\w\S*`)

func NewInterpolation() *Interpolation {
	i := &Interpolation{modifiers: map[string]modifier{}}
	i.Register("uppercase", func(v any, _ map[string]any) any { return strings.ToUpper(Stringify(v)) })
	i.Register("lowercase", func(v any, _ map[string]any) any { return strings.ToLower(Stringify(v)) })
	i.Register("title", func(v any, _ map[string]any) any {
		return titleRe.ReplaceAllStringFunc(Stringify(v), func(s string) string { return strings.ToUpper(s[:1]) + strings.ToLower(s[1:]) })
	})
	i.Register("moment", func(v any, data map[string]any) any {
		text := Stringify(v)
		if dateRe.MatchString(text) {
			if m, ok := ParseMoment(text); ok {
				return m
			}
			return v
		}
		if env, ok := data["env"]; ok {
			if found := Get(env, text, nil); found != nil {
				if m, ok := ParseMoment(Stringify(found)); ok {
					return m
				}
			}
		}
		return v
	})
	subDay := func(v any, _ map[string]any) any {
		if m, ok := asMoment(v); ok {
			return m.Subtract(1, "d")
		}
		return v
	}
	i.Register("sub_day", subDay)
	i.Register("subDay", subDay)
	for _, f := range []string{"DDMMYYYY", "DD/MM/YYYY", "YYYY-MM-DD", "YYYYMMDD"} {
		format := f
		i.Register(format, func(v any, _ map[string]any) any {
			if m, ok := asMoment(v); ok {
				return m.Format(format)
			}
			return v
		})
	}
	i.Register("date_sub_day", func(v any, _ map[string]any) any { return Moment{time.Now()}.Subtract(toInt(v), "day") })
	i.Register("date_sub_month", func(v any, _ map[string]any) any { return Moment{time.Now()}.Subtract(toInt(v), "month") })
	i.Register("page", func(v any, _ map[string]any) any {
		i.mu.Lock()
		defer i.mu.Unlock()
		n := toInt(v)
		if n == 0 {
			n = 1
		}
		i.page += n
		return i.page
	})
	return i
}

func toInt(v any) int {
	n, _ := strconv.Atoi(strings.TrimSpace(Stringify(v)))
	return n
}

func (i *Interpolation) Register(key string, m modifier) { i.modifiers[strings.ToLower(key)] = m }

func (i *Interpolation) SetPage(v int) {
	i.mu.Lock()
	i.page = v
	i.mu.Unlock()
}

func (i *Interpolation) Interpolate(template string, data, scope map[string]any) string {
	now := Moment{time.Now()}
	bag := map[string]any{
		"now": now, "NOW": now,
		"tomorrow": now.Add(1, "d"), "TOMORROW": now.Add(1, "d"),
		"yesterday": now.Subtract(1, "d"), "YESTERDAY": now.Subtract(1, "d"),
	}
	for k, v := range scope {
		bag[k] = v
	}
	for k, v := range data {
		bag[k] = v
	}
	return i.parse(template, bag)
}

func (i *Interpolation) parse(str string, data map[string]any) string {
	for _, d := range delimiters {
		re := regexp.MustCompile("(?i)" + regexp.QuoteMeta(d[0]) + `([^}]+?)` + regexp.QuoteMeta(d[1]))
		matches := re.FindAllStringSubmatch(str, -1)
		for _, m := range matches {
			str = i.applyRule(str, m[0], m[1], data)
		}
	}
	return str
}

func (i *Interpolation) applyRule(str, replace, inner string, data map[string]any) string {
	var modifiers []string
	if pipe := strings.Index(inner, "|"); pipe > 0 {
		for _, m := range strings.Split(inner[pipe+1:], ",") {
			modifiers = append(modifiers, strings.TrimSpace(m))
		}
		inner = inner[:pipe]
	}
	key, alternative := inner, ""
	if colon := strings.Index(inner, ":"); colon > 0 {
		alternative = inner[colon+1:]
		key = inner[:colon]
	}
	key = strings.TrimSpace(key)

	value := applyData(key, data)
	if core.Truthy(value) {
		return strings.Replace(str, replace, Stringify(i.applyModifiers(modifiers, value, data)), 1)
	}
	if alternative != "" {
		return strings.Replace(str, replace, Stringify(i.applyModifiers(modifiers, alternative, data)), 1)
	}
	def := i.applyModifiers(modifiers, key, data)
	if s, ok := def.(string); ok && s == key {
		return strings.Replace(str, replace, "", 1)
	}
	return strings.Replace(str, replace, Stringify(def), 1)
}

func applyData(key string, data map[string]any) any {
	if strings.Contains(key, ".") || strings.Contains(key, "[") {
		row := core.NewRow()
		for k, v := range data {
			row.Set(k, v)
		}
		return Get(row, key, "")
	}
	return data[key]
}

func (i *Interpolation) applyModifiers(mods []string, value any, data map[string]any) any {
	for _, name := range mods {
		if name == "" {
			continue
		}
		if m, ok := i.modifiers[strings.ToLower(name)]; ok {
			value = m(value, data)
		}
	}
	return value
}
