// Package drivers implements the database adapters (port of src/adapters/*.adapter.ts).
package drivers

import (
	"context"
	"database/sql"
	"encoding/base64"
	"encoding/json"
	"fmt"
	"reflect"
	"strconv"
	"strings"
	"time"

	"github.com/seedz-ag/sdz-agent-go/internal/api"
	"github.com/seedz-ag/sdz-agent-go/internal/core"
	"github.com/seedz-ag/sdz-agent-go/internal/data"
)

// sqlDriver is the shared database/sql plumbing: lazy connect, ordered rows, log-and-swallow policy.
type sqlDriver struct {
	name   string
	cfg    data.Config
	logger *core.Logger
	db     *sql.DB
	open   func() (*sql.DB, error)
	after  func(ctx context.Context, db *sql.DB) error
}

func (s *sqlDriver) BuildQuery(string, []api.Parameter) (string, bool) { return "", false }
func (s *sqlDriver) CheckConnection(context.Context) (bool, bool)      { return false, false }

func (s *sqlDriver) Connect(ctx context.Context) error {
	if s.db != nil {
		return nil
	}
	db, err := s.open()
	if err == nil {
		db.SetMaxOpenConns(1)
		db.SetMaxIdleConns(1)
		db.SetConnMaxLifetime(0)
		err = db.PingContext(ctx)
		if err == nil && s.after != nil {
			err = s.after(ctx, db)
		}
	}
	if err != nil {
		if db != nil {
			_ = db.Close()
		}
		s.logger.Error(s.name+" CONNECT ERROR", err)
		return err
	}
	s.db = db
	return nil
}

func (s *sqlDriver) Disconnect(context.Context) error {
	if s.db == nil {
		return nil
	}
	err := s.db.Close()
	if err != nil {
		s.logger.Error(s.name+" CLOSE ERROR", err)
	}
	s.db = nil
	return err
}

func (s *sqlDriver) Execute(ctx context.Context, query string) ([]*core.Row, error) {
	rows, err := s.read(ctx, query)
	if err != nil {
		s.logger.Error(s.name+" EXECUTE ERROR", query, err)
		return []*core.Row{}, nil
	}
	return rows, nil
}

func (s *sqlDriver) ExecuteQueryRemote(ctx context.Context, query string) (any, error) {
	rows, err := s.read(ctx, query)
	if err != nil {
		s.logger.Error(s.name+" EXECUTE REMOTE ERROR", query, err)
		return err.Error(), nil
	}
	return rows, nil
}

func (s *sqlDriver) read(ctx context.Context, query string) ([]*core.Row, error) {
	if s.db == nil {
		if err := s.Connect(ctx); err != nil {
			return nil, err
		}
	}
	rows, err := s.db.QueryContext(ctx, query)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	// Oracle's DATE carries a time of day (the .NET driver returns a DateTime there too).
	// The ODBC driver reports no column type names, so a value at exactly midnight is taken as a DATE there.
	return materialize(rows, s.name != "ORACLE", s.name == "ODBC")
}

// Materialize converts sql.Rows into ordered rows with JSON-friendly values.
func Materialize(rows *sql.Rows) ([]*core.Row, error) { return materialize(rows, true, false) }

// dateOnlyTypes are the column types whose values have no time of day (serialised "2006-01-02").
var dateOnlyTypes = map[string]bool{"DATE": true, "SQL_TYPE_DATE": true}

// utcTypes are the column types whose values are absolute instants (serialised with "Z").
var utcTypes = map[string]bool{"TIMESTAMPTZ": true, "TIMESTAMP WITH TIME ZONE": true}

func materialize(rows *sql.Rows, dateOnly, midnightIsDate bool) ([]*core.Row, error) {
	cols, err := rows.Columns()
	if err != nil {
		return nil, err
	}
	types, _ := rows.ColumnTypes()
	out := []*core.Row{}
	values := make([]any, len(cols))
	ptrs := make([]any, len(cols))
	for i := range values {
		ptrs[i] = &values[i]
	}
	for rows.Next() {
		if err := rows.Scan(ptrs...); err != nil {
			return nil, err
		}
		row := core.NewRow()
		for i, c := range cols {
			var typeName string
			if i < len(types) && types[i] != nil {
				typeName = strings.ToUpper(types[i].DatabaseTypeName())
			}
			v := Convert(values[i], typeName)
			if t, ok := v.(time.Time); ok {
				switch {
				case dateOnly && dateOnlyTypes[typeName]:
					v = core.DateOnly(t)
				case midnightIsDate && typeName == "" && t.Hour() == 0 && t.Minute() == 0 && t.Second() == 0 && t.Nanosecond() == 0:
					v = core.DateOnly(t)
				case utcTypes[typeName]:
					v = core.UTCTime(t)
				}
			}
			row.Set(c, v)
		}
		out = append(out, row)
	}
	return out, rows.Err()
}

var numericTypes = map[string]bool{
	"DECIMAL": true, "NUMERIC": true, "NUMBER": true, "MONEY": true, "SMALLMONEY": true, "DEC": true, "FIXED": true,
	"INT64": true, "BIGINT": true, "FLOAT": true, "DOUBLE": true, "REAL": true, "INT": true, "INTEGER": true,
	"SMALLINT": true, "TINYINT": true, "MEDIUMINT": true, "INT2": true, "INT4": true, "INT8": true, "FLOAT4": true, "FLOAT8": true,
}

var binaryTypes = map[string]bool{
	"BLOB": true, "BYTEA": true, "BINARY": true, "VARBINARY": true, "IMAGE": true, "RAW": true, "LONG RAW": true,
	"LONGBLOB": true, "MEDIUMBLOB": true, "TINYBLOB": true,
}

// Convert maps a driver value to what JSON.stringify produced for the Node drivers.
func Convert(v any, typeName string) any {
	switch t := v.(type) {
	case nil:
		return nil
	case []byte:
		if binaryTypes[typeName] {
			return base64.StdEncoding.EncodeToString(t)
		}
		s := string(t)
		if numericTypes[typeName] && isNumber(s) {
			return json.Number(core.NormalizeNumber(s))
		}
		return s
	case string:
		if numericTypes[typeName] && isNumber(t) {
			return json.Number(core.NormalizeNumber(t))
		}
		return t
	case time.Time:
		return t
	case bool, int, int8, int16, int32, int64, uint, uint8, uint16, uint32, uint64, float32, float64, json.Number:
		return t
	case fmt.Stringer:
		s := t.String()
		if numericTypes[typeName] && isNumber(s) {
			return json.Number(core.NormalizeNumber(s))
		}
		return s
	default:
		rv := reflect.ValueOf(v)
		if rv.Kind() == reflect.Ptr {
			if rv.IsNil() {
				return nil
			}
			return Convert(rv.Elem().Interface(), typeName)
		}
		return fmt.Sprintf("%v", v)
	}
}

func isNumber(s string) bool {
	if s == "" {
		return false
	}
	_, err := strconv.ParseFloat(strings.TrimSpace(s), 64)
	return err == nil
}

// LimitOffset = query + " LIMIT n" (limit>0) + " OFFSET page*n" (page>0 && limit>0); page 0 adds no OFFSET, as in the TS.
func LimitOffset(query string, page *int, limit int) string {
	parts := []string{query}
	if limit > 0 {
		parts = append(parts, fmt.Sprintf("LIMIT %d", limit))
		if page != nil && *page > 0 {
			parts = append(parts, fmt.Sprintf("OFFSET %d", *page*limit))
		}
	}
	return strings.Join(parts, " ")
}

func hostPort(cfg data.Config, defaultPort int) string {
	port := cfg.Port
	if port == 0 {
		port = defaultPort
	}
	return fmt.Sprintf("%s:%d", cfg.Host, port)
}
