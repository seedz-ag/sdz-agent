package drivers

import (
	"context"
	"database/sql"
	"fmt"
	"regexp"
	"strconv"
	"strings"

	goora "github.com/sijms/go-ora/v2"
	"github.com/seedz-ag/sdz-agent-go/internal/core"
	"github.com/seedz-ag/sdz-agent-go/internal/data"
)

// oracleDriver uses the pure Go driver: no Instant Client, no LD_LIBRARY_PATH.
type oracleDriver struct {
	sqlDriver
	version string
}

var fromSplit = regexp.MustCompile(`(?i)from`)

func newOracle(cfg data.Config, logger *core.Logger) data.Adapter {
	d := &oracleDriver{}
	d.name, d.cfg, d.logger = "ORACLE", cfg, logger
	d.open = func() (*sql.DB, error) {
		port := cfg.Port
		if port == 0 {
			port = 1521
		}
		opts := map[string]string{"TIMEOUT": "60", "lob fetch": "post"}
		return sql.Open("oracle", goora.BuildUrl(cfg.Host, port, cfg.Service, cfg.Username, cfg.Password, opts))
	}
	d.after = func(ctx context.Context, db *sql.DB) error {
		if strings.TrimSpace(cfg.Schema) == "" {
			return nil
		}
		_, err := db.ExecContext(ctx, "ALTER SESSION SET CURRENT_SCHEMA = "+cfg.Schema)
		return err
	}
	return d
}

func (d *oracleDriver) GetVersion(ctx context.Context) (string, error) {
	if d.version != "" {
		return d.version, nil
	}
	rows, err := d.read(ctx, "SELECT * FROM PRODUCT_COMPONENT_VERSION")
	if err != nil {
		return "", err
	}
	if len(rows) > 0 {
		if v, ok := rows[0].GetFold("VERSION"); ok && v != nil {
			d.version = strings.Split(core.Stringify(v), ".")[0]
		}
	}
	return d.version, nil
}

func (d *oracleDriver) Query(ctx context.Context, query string, page *int, limit int) ([]*core.Row, error) {
	if d.version == "" {
		if _, err := d.GetVersion(ctx); err != nil {
			d.logger.Error("ORACLE EXECUTE ERROR", "SELECT * FROM PRODUCT_COMPONENT_VERSION", err)
		}
	}
	if major, err := strconv.Atoi(d.version); err == nil && major > 11 {
		parts := []string{query}
		if page != nil && *page > 0 && limit > 0 {
			parts = append(parts, fmt.Sprintf("OFFSET %d ROWS", *page*limit))
		}
		if limit > 0 {
			parts = append(parts, fmt.Sprintf("FETCH NEXT %d ROWS ONLY", limit))
		}
		return d.Execute(ctx, strings.Join(parts, " "))
	}

	// legacy (<= 11g) ROWNUM wrapper, reproduced from the TS including its arithmetic
	tmp := fromSplit.Split(query, -1)
	tmp[0] = tmp[0] + ", ROWNUM AS OFFSET "
	inner := strings.Join(tmp, "FROM")
	p := 0
	if page != nil {
		p = *page
	}
	legacy := []string{fmt.Sprintf("SELECT * FROM (%s)", inner)}
	if limit > 0 {
		lower := p
		if lower < 0 {
			lower = 0
		}
		legacy = append(legacy, fmt.Sprintf("WHERE OFFSET  > %d", lower*limit))
		upper := p // TS: Math.max(page || 0 + 1, 1) -> page when truthy, else 1
		if upper == 0 {
			upper = 1
		}
		legacy = append(legacy, fmt.Sprintf("AND OFFSET <= %d", upper*limit))
	}
	return d.Execute(ctx, strings.Join(legacy, " "))
}
