// Package consumers read the customer's data source and push through a transport.
package consumers

import (
	"context"
	"errors"
	"strings"

	"github.com/seedz-ag/sdz-agent-go/internal/api"
	"github.com/seedz-ag/sdz-agent-go/internal/core"
	"github.com/seedz-ag/sdz-agent-go/internal/transports"
)

type Consumer interface {
	Consume(ctx context.Context) error
	SetSetting(s *api.Setting) Consumer
	SetTransport(t transports.Transport) Consumer
}

func hasAgentSchemaForEntity(schemas []api.Schema, entity string) bool {
	for _, s := range schemas {
		if s.Entity == entity && s.InputFormat == "AGENT" {
			return true
		}
	}
	return false
}

func needsToHydrate(s api.Schema) bool { return s.InputFormat == "AGENT" && len(s.Maps) > 0 }

// Resolver is the port of ConsumerResolverService.
type Resolver struct {
	database *Database
	ftp      *FTP
	http     *HTTP
	logger   *core.Logger
}

func NewResolver(db *Database, ftp *FTP, http *HTTP, logger *core.Logger) *Resolver {
	return &Resolver{database: db, ftp: ftp, http: http, logger: logger}
}

func (r *Resolver) Resolve(dataSource string) (Consumer, error) {
	r.logger.Infof("RESOLVING CONSUMER: %s", strings.ToUpper(dataSource))
	var c Consumer
	switch strings.ToUpper(dataSource) {
	case "API", "HTTP", "WS":
		c = r.http
	case "DATABASE", "DB":
		c = r.database
	case "FTP":
		c = r.ftp
	default:
		r.logger.Error("DATASOURCE CONSUMER NOT FOUND")
		return nil, errors.New("DATASOURCE CONSUMER NOT FOUND")
	}
	r.logger.Info("CONSUMER RESOLVED")
	return c, nil
}

func rowsToAny(rows []*core.Row) []any {
	out := make([]any, len(rows))
	for i, r := range rows {
		out[i] = r
	}
	return out
}
