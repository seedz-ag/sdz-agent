// Package data holds the database adapter contract and the driver dispatcher.
package data

import (
	"context"
	"strconv"
	"strings"

	"github.com/seedz-ag/sdz-agent-go/internal/api"
	"github.com/seedz-ag/sdz-agent-go/internal/core"
)

// Config is the DATABASE_* parameters of a setting, lower-cased without the prefix.
type Config struct {
	Host             string
	Locale           string
	Schema           string
	Password         string
	Port             int
	Server           string
	Service          string
	Username         string
	ConnectionString string
	Raw              map[string]string
}

func ConfigFromParameters(params []api.Parameter) Config {
	raw := map[string]string{}
	for _, p := range params {
		if strings.HasPrefix(p.Key, "DATABASE_") {
			raw[strings.ToLower(strings.TrimPrefix(p.Key, "DATABASE_"))] = p.Value
		}
	}
	port, _ := strconv.Atoi(raw["port"])
	return Config{
		Host: raw["host"], Locale: raw["locale"], Schema: raw["schema"], Password: raw["password"], Port: port,
		Server: raw["server"], Service: raw["service"], Username: raw["username"], ConnectionString: raw["connectionstring"], Raw: raw,
	}
}

// Adapter is the port of IDatabaseAdapter. Rows keep column order; NULL → nil.
type Adapter interface {
	// BuildQuery optionally replaces {KEY} placeholders in a driver-specific way; ok=false means "use the default".
	BuildQuery(query string, parameters []api.Parameter) (string, bool)
	// CheckConnection optionally runs a driver-specific probe; ok=false means "run SELECT 1".
	CheckConnection(ctx context.Context) (healthy bool, ok bool)
	Connect(ctx context.Context) error
	Disconnect(ctx context.Context) error
	// Execute runs the statement as-is. Errors are logged and yield an empty list (legacy behaviour).
	Execute(ctx context.Context, query string) ([]*core.Row, error)
	// ExecuteQueryRemote runs a statement from the listen channel; on error returns the error message instead of rows.
	ExecuteQueryRemote(ctx context.Context, query string) (any, error)
	GetVersion(ctx context.Context) (string, error)
	// Query runs the (already interpolated) query adding driver-specific pagination (page may be nil).
	Query(ctx context.Context, query string, page *int, limit int) ([]*core.Row, error)
}

// Factory builds a driver for a config; registered by drivers package.
type Factory func(cfg Config, logger *core.Logger) Adapter

var registry = map[string]Factory{}

func Register(name string, f Factory) { registry[strings.ToUpper(name)] = f }

func Lookup(driver string) (Factory, bool) {
	f, ok := registry[strings.ToUpper(driver)]
	return f, ok
}

func SupportedDrivers() []string {
	out := make([]string, 0, len(registry))
	for k := range registry {
		out = append(out, k)
	}
	return out
}
