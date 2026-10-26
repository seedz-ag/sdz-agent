package drivers

import (
	"context"
	"database/sql"
	"fmt"
	"net/url"
	"regexp"
	"strings"

	_ "github.com/nakagami/firebirdsql"
	"github.com/seedz-ag/sdz-agent-go/internal/core"
	"github.com/seedz-ag/sdz-agent-go/internal/data"
)

type firebirdDriver struct{ sqlDriver }

var leadingSelect = regexp.MustCompile(`(?i)^SELECT`)

func newFirebird(cfg data.Config, logger *core.Logger) data.Adapter {
	d := &firebirdDriver{}
	d.name, d.cfg, d.logger = "FIREBIRD", cfg, logger
	d.open = func() (*sql.DB, error) {
		charset := cfg.Locale
		if charset == "" {
			charset = "UTF8"
		}
		// user:password@host[:port]/database_path?charset=...
		dsn := fmt.Sprintf("%s:%s@%s/%s?charset=%s", url.QueryEscape(cfg.Username), url.QueryEscape(cfg.Password), hostPort(cfg, 3050), strings.TrimPrefix(cfg.Schema, "/"), charset)
		return sql.Open("firebirdsql", dsn)
	}
	return d
}

func (d *firebirdDriver) GetVersion(context.Context) (string, error) { return "", nil }

func (d *firebirdDriver) Query(ctx context.Context, query string, page *int, limit int) ([]*core.Row, error) {
	parts := []string{"SELECT"}
	if limit > 0 {
		parts = append(parts, fmt.Sprintf("FIRST %d", limit))
		if page != nil && *page > 0 {
			parts = append(parts, fmt.Sprintf("SKIP %d", limit**page))
		}
	}
	parts = append(parts, leadingSelect.ReplaceAllString(strings.TrimSpace(query), ""))
	return d.Execute(ctx, strings.Join(parts, " "))
}
