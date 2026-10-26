package drivers

import (
	"context"
	"database/sql"
	"fmt"
	"net/url"
	"strings"

	_ "github.com/microsoft/go-mssqldb"
	"github.com/seedz-ag/sdz-agent-go/internal/api"
	"github.com/seedz-ag/sdz-agent-go/internal/core"
	"github.com/seedz-ag/sdz-agent-go/internal/data"
)

type mssqlDriver struct{ sqlDriver }

func newMssql(cfg data.Config, logger *core.Logger) data.Adapter {
	d := &mssqlDriver{}
	d.name, d.cfg, d.logger = "MSSQL", cfg, logger
	d.open = func() (*sql.DB, error) {
		host := cfg.Host
		if cfg.Port != 0 {
			host = fmt.Sprintf("%s:%d", cfg.Host, cfg.Port)
		}
		q := url.Values{}
		q.Set("database", cfg.Schema)
		q.Set("encrypt", "optional")
		q.Set("TrustServerCertificate", "true")
		q.Set("connection timeout", "60")
		u := &url.URL{Scheme: "sqlserver", User: url.UserPassword(cfg.Username, cfg.Password), Host: host, RawQuery: q.Encode()}
		return sql.Open("sqlserver", u.String())
	}
	return d
}

// BuildQuery wraps START_DATE in single quotes, other keys are replaced literally.
func (d *mssqlDriver) BuildQuery(query string, params []api.Parameter) (string, bool) {
	for _, p := range params {
		v := p.Value
		if p.Key == "START_DATE" {
			v = "'" + v + "'"
		}
		query = strings.ReplaceAll(query, "{"+p.Key+"}", v)
	}
	return query, true
}

func (d *mssqlDriver) GetVersion(context.Context) (string, error) { return "", nil }

func (d *mssqlDriver) Query(ctx context.Context, query string, page *int, limit int) ([]*core.Row, error) {
	if !strings.Contains(strings.ToUpper(query), "ORDER BY") {
		if page != nil && limit > 0 {
			query = fmt.Sprintf("%s ORDER BY TIPOQUERY ASC, R_E_C_N_O_ ASC OFFSET %d ROWS FETCH NEXT %d ROWS ONLY", query, *page*limit, limit)
		}
		return d.Execute(ctx, query)
	}
	if page != nil && limit > 0 {
		query = fmt.Sprintf("%s OFFSET %d ROWS FETCH NEXT %d ROWS ONLY", query, *page*limit, limit)
	}
	return d.Execute(ctx, query)
}
