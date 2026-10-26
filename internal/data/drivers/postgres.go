package drivers

import (
	"context"
	"database/sql"
	"fmt"
	"net/url"

	_ "github.com/jackc/pgx/v5/stdlib"
	"github.com/seedz-ag/sdz-agent-go/internal/core"
	"github.com/seedz-ag/sdz-agent-go/internal/data"
)

// postgresDriver serves both POSTGRES and REDSHIFT (Redshift speaks the Postgres protocol).
type postgresDriver struct{ sqlDriver }

func newPostgres(name string) data.Factory {
	return func(cfg data.Config, logger *core.Logger) data.Adapter {
		d := &postgresDriver{}
		d.name, d.cfg, d.logger = name, cfg, logger
		d.open = func() (*sql.DB, error) {
			q := url.Values{}
			q.Set("sslmode", "prefer")
			q.Set("connect_timeout", "60")
			if name == "REDSHIFT" {
				// Redshift lacks the extended-protocol features pgx probes for
				q.Set("default_query_exec_mode", "simple_protocol")
			}
			u := &url.URL{Scheme: "postgres", User: url.UserPassword(cfg.Username, cfg.Password), Host: hostPort(cfg, 5432), Path: "/" + cfg.Schema, RawQuery: q.Encode()}
			return sql.Open("pgx", u.String())
		}
		return d
	}
}

func (d *postgresDriver) GetVersion(context.Context) (string, error) { return "n/a", nil }

func (d *postgresDriver) Query(ctx context.Context, query string, page *int, limit int) ([]*core.Row, error) {
	return d.Execute(ctx, LimitOffset(query, page, limit))
}

var _ = fmt.Sprintf
