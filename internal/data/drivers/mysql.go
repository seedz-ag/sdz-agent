package drivers

import (
	"context"
	"database/sql"

	"github.com/go-sql-driver/mysql"
	"github.com/seedz-ag/sdz-agent-go/internal/core"
	"github.com/seedz-ag/sdz-agent-go/internal/data"
)

type mysqlDriver struct{ sqlDriver }

func newMysql(cfg data.Config, logger *core.Logger) data.Adapter {
	d := &mysqlDriver{}
	d.name, d.cfg, d.logger = "MYSQL", cfg, logger
	d.open = func() (*sql.DB, error) {
		c := mysql.NewConfig()
		c.User = cfg.Username
		c.Passwd = cfg.Password
		c.Net = "tcp"
		c.Addr = hostPort(cfg, 3306)
		c.DBName = cfg.Schema
		c.ParseTime = true
		c.AllowNativePasswords = true
		c.InterpolateParams = true
		return sql.Open("mysql", c.FormatDSN())
	}
	return d
}

func (d *mysqlDriver) GetVersion(ctx context.Context) (string, error) {
	rows, err := d.Execute(ctx, "SELECT VERSION() as version")
	if err != nil || len(rows) == 0 {
		return "", err
	}
	v, _ := rows[0].GetFold("version")
	return core.Stringify(v), nil
}

func (d *mysqlDriver) Query(ctx context.Context, query string, page *int, limit int) ([]*core.Row, error) {
	return d.Execute(ctx, LimitOffset(query, page, limit))
}
