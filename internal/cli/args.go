// Package cli is a tiny yargs-like argument parser: cmd [positional...] --flag value --flag=value -f value --no-flag.
package cli

import "strings"

var aliases = map[string]string{
	"e": "env", "n": "extract-last-n-days", "q": "query", "r": "raw-only", "s": "schema",
	"c": "use-console-log", "l": "listen", "f": "forever", "v": "verbose",
}

type Args struct {
	Command    string
	Positional []string
	Options    map[string]string
}

func Parse(argv []string) *Args {
	a := &Args{Options: map[string]string{}}
	for i := 0; i < len(argv); i++ {
		arg := argv[i]
		switch {
		case strings.HasPrefix(arg, "--"):
			body := arg[2:]
			if eq := strings.Index(body, "="); eq >= 0 {
				a.Options[strings.ToLower(body[:eq])] = body[eq+1:]
			} else if strings.HasPrefix(body, "no-") {
				a.Options[strings.ToLower(body[3:])] = "false"
			} else if i+1 < len(argv) && !strings.HasPrefix(argv[i+1], "-") {
				a.Options[strings.ToLower(body)] = argv[i+1]
				i++
			} else {
				a.Options[strings.ToLower(body)] = "true"
			}
		case strings.HasPrefix(arg, "-") && len(arg) > 1:
			key := arg[1:]
			if full, ok := aliases[key]; ok {
				key = full
			}
			if i+1 < len(argv) && !strings.HasPrefix(argv[i+1], "-") {
				a.Options[key] = argv[i+1]
				i++
			} else {
				a.Options[key] = "true"
			}
		case a.Command == "":
			a.Command = arg
		default:
			a.Positional = append(a.Positional, arg)
		}
	}
	return a
}

func (a *Args) Get(key string) string { return a.Options[strings.ToLower(key)] }
func (a *Args) Has(key string) bool   { _, ok := a.Options[strings.ToLower(key)]; return ok }
func (a *Args) Flag(key string, fallback bool) bool {
	v, ok := a.Options[strings.ToLower(key)]
	if !ok {
		return fallback
	}
	return strings.EqualFold(v, "true") || v == "1"
}
