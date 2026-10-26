//go:build odbc

package drivers

import (
	"context"
	"database/sql"

	_ "github.com/alexbrainman/odbc"
	"github.com/seedz-ag/sdz-agent-go/internal/core"
	"github.com/seedz-ag/sdz-agent-go/internal/data"
)

// odbcDriver connects through unixODBC / the Windows Driver Manager with DATABASE_CONNECTIONSTRING.
type odbcDriver struct{ sqlDriver }

func newOdbc(cfg data.Config, logger *core.Logger) data.Adapter {
	d := &odbcDriver{}
	d.name, d.cfg, d.logger = "ODBC", cfg, logger
	d.open = func() (*sql.DB, error) { return sql.Open("odbc", cfg.ConnectionString) }
	return d
}

func (d *odbcDriver) GetVersion(context.Context) (string, error) { return "", nil }

func (d *odbcDriver) Query(ctx context.Context, query string, page *int, limit int) ([]*core.Row, error) {
	return d.Execute(ctx, LimitOffset(query, page, limit))
}
