package data

import (
	"context"
	"fmt"
	"math"
	"strings"
	"time"

	"github.com/seedz-ag/sdz-agent-go/internal/api"
	"github.com/seedz-ag/sdz-agent-go/internal/core"
)

// Dispatcher is the port of DatabaseAdapter: picks the driver for DATABASE_DRIVER and interpolates query parameters.
type Dispatcher struct {
	env        *core.Env
	logger     *core.Logger
	adapter    Adapter
	cfg        Config
	driver     string
	parameters []api.Parameter
}

func NewDispatcher(env *core.Env, logger *core.Logger) *Dispatcher {
	return &Dispatcher{env: env, logger: logger}
}

func (d *Dispatcher) Driver() string { return d.driver }

// Initialize creates the driver, disposes the previous one and connects. Connect errors are logged and swallowed (legacy).
func (d *Dispatcher) Initialize(ctx context.Context, driver string, cfg Config, params []api.Parameter) error {
	d.driver = strings.ToUpper(driver)
	d.cfg = cfg
	d.parameters = params
	if d.adapter != nil {
		_ = d.adapter.Disconnect(ctx)
		d.adapter = nil
	}
	factory, ok := Lookup(d.driver)
	if !ok {
		err := fmt.Errorf("DATABASE DRIVER NOT SUPPORTED: %s", d.driver)
		d.logger.Error("DATABASE CONNECT ERROR", err)
		return err
	}
	d.adapter = factory(cfg, d.logger)
	if err := d.adapter.Connect(ctx); err != nil {
		d.logger.Error("DATABASE CONNECT ERROR", err)
	}
	return nil
}

// BuildQuery resolves LAST_EXTRACTION/START_DATE and replaces {KEY} placeholders.
func (d *Dispatcher) BuildQuery(query string) string {
	params := append([]api.Parameter(nil), d.parameters...)

	lastExtraction := ""
	for _, p := range params {
		if p.Key == "LAST_EXTRACTION" {
			lastExtraction = p.Value
		}
	}
	if lastExtraction != "" {
		d.logger.Infof("SETTING LAST_EXTRACTION %s", lastExtraction)
	}

	days := d.env.ExtractLastNDays()
	if days == 0 && lastExtraction != "" {
		if last, err := time.ParseInLocation("2006-01-02", lastExtraction, time.Local); err == nil {
			days = int(math.Ceil(math.Abs(time.Since(last).Hours() / 24)))
		}
	}
	d.logger.Infof("RESOLVED EXTRACTION N DAYS: %d", days)

	if days != 0 {
		params = append(params, api.Parameter{Key: "START_DATE", Value: time.Now().AddDate(0, 0, -days).Format("2006-01-02") + " 00:00:00"})
	}

	if d.adapter != nil {
		if q, ok := d.adapter.BuildQuery(query, params); ok {
			return q
		}
	}
	return DefaultBuildQuery(query, params)
}

// DefaultBuildQuery replaces every {KEY} with its literal value.
func DefaultBuildQuery(query string, params []api.Parameter) string {
	for _, p := range params {
		query = strings.ReplaceAll(query, "{"+p.Key+"}", p.Value)
	}
	return query
}

func (d *Dispatcher) CheckConnection(ctx context.Context) (bool, error) {
	if d.adapter == nil {
		return false, fmt.Errorf("DATABASE ADAPTER NOT INITIALIZED")
	}
	if healthy, ok := d.adapter.CheckConnection(ctx); ok {
		return healthy, nil
	}
	rows, err := d.adapter.Execute(ctx, "SELECT 1")
	if err != nil {
		return false, err
	}
	return len(rows) > 0, nil
}

func (d *Dispatcher) Execute(ctx context.Context, query string) ([]*core.Row, error) {
	if d.adapter == nil {
		return nil, fmt.Errorf("DATABASE ADAPTER NOT INITIALIZED")
	}
	return d.adapter.Execute(ctx, query)
}

func (d *Dispatcher) ExecuteQueryRemote(ctx context.Context, query string) (any, error) {
	if d.adapter == nil {
		return []*core.Row{}, nil
	}
	return d.adapter.ExecuteQueryRemote(ctx, query)
}

func (d *Dispatcher) GetVersion(ctx context.Context) (string, error) {
	if d.adapter == nil {
		return "", fmt.Errorf("DATABASE ADAPTER NOT INITIALIZED")
	}
	return d.adapter.GetVersion(ctx)
}

func (d *Dispatcher) Query(ctx context.Context, query string, page *int, limit int) ([]*core.Row, error) {
	if d.adapter == nil {
		return nil, fmt.Errorf("DATABASE ADAPTER NOT INITIALIZED")
	}
	return d.adapter.Query(ctx, d.BuildQuery(query), page, limit)
}

func (d *Dispatcher) Disconnect(ctx context.Context) error {
	if d.adapter == nil {
		return nil
	}
	err := d.adapter.Disconnect(ctx)
	d.adapter = nil
	return err
}
