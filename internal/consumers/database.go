package consumers

import (
	"context"
	"errors"
	"fmt"
	"os"
	"strconv"
	"strings"
	"sync"
	"time"

	"github.com/seedz-ag/sdz-agent-go/internal/api"
	"github.com/seedz-ag/sdz-agent-go/internal/core"
	"github.com/seedz-ag/sdz-agent-go/internal/data"
	"github.com/seedz-ag/sdz-agent-go/internal/services"
	"github.com/seedz-ag/sdz-agent-go/internal/transports"
)

// Database runs each schema's queries page by page and ships raw + hydrated rows.
type Database struct {
	db        *data.Dispatcher
	env       *core.Env
	paths     *core.Paths
	hydrator  *services.Hydrator
	logger    *core.Logger
	utils     *core.Utils
	setting   *api.Setting
	transport transports.Transport
}

func NewDatabase(db *data.Dispatcher, env *core.Env, paths *core.Paths, h *services.Hydrator, logger *core.Logger, utils *core.Utils) *Database {
	return &Database{db: db, env: env, paths: paths, hydrator: h, logger: logger, utils: utils}
}

func (c *Database) SetSetting(s *api.Setting) Consumer           { c.setting = s; return c }
func (c *Database) SetTransport(t transports.Transport) Consumer { c.transport = t; return c }

func (c *Database) Consume(ctx context.Context) error {
	c.logger.Info("CONNETING TO DATABASE")
	cfg := data.ConfigFromParameters(c.setting.Parameters)
	driver := strings.ToUpper(c.setting.Parameter("DATABASE_DRIVER"))
	if driver == "" {
		c.logger.Error("DATABASE DRIVER NOT FOUND")
		return nil
	}
	if err := c.db.Initialize(ctx, driver, cfg, c.setting.Parameters); err != nil {
		return err
	}
	c.logger.Info("DATABASE CONNECTED")

	if t := c.env.Type(); t == "all" || t == "datasource" {
		c.logger.Info("EXECUTING DATABASE CHECK")
		ok, err := c.db.CheckConnection(ctx)
		c.logger.Info("DATABASE CHECK DONE")
		if err != nil {
			return err
		}
		if !ok {
			return errors.New("DATABASE CHECK FAILED")
		}
		return nil
	}

	scope := c.env.Schema()
	if scope != "" {
		c.logger.Infof("RUNNING EXTRACTION ONLY FOR SCHEMA: %s", scope)
	}
	totalStart := time.Now()
	limit := 1000
	if n, err := strconv.Atoi(c.setting.Parameter("PAGE_SIZE")); err == nil && n > 0 {
		limit = n
	}

	for _, schema := range c.setting.Schemas {
		if ctx.Err() != nil {
			return ctx.Err()
		}
		if scope != "" && schema.Entity != scope {
			continue
		}
		if schema.InputFormat != "AGENT" && hasAgentSchemaForEntity(c.setting.Schemas, schema.Entity) {
			continue
		}
		entityStart := time.Now()
		entity := strings.ToUpper(schema.Entity)
		c.logger.Infof("CONSUMING %s", entity)

		var queries []api.Query
		for _, q := range c.setting.Queries {
			if q.Entity == schema.Entity {
				queries = append(queries, q)
			}
		}
		if len(queries) == 0 {
			c.logger.Error("SQL NOT FOUND")
			return errors.New("SQL NOT FOUND")
		}
		hydrate := needsToHydrate(schema)
		resourceName := schema.APIResource
		if resourceName == "" {
			resourceName = schema.Entity
		}

		for index, sql := range queries {
			page := 0
			_ = os.MkdirAll(c.paths.OutputDir(), 0o750)
			_ = os.WriteFile(c.paths.Output(fmt.Sprintf("%s-%d.sql", schema.Entity, index)), []byte(sql.Command), 0o640)
			if hydrate {
				c.logger.Infof("DATA FOR: %s WILL BE TRANFORMED USING SCHEMA MAPS", entity)
			}
			c.logger.Infof("EXECUTE SQL QUERY WITH LIMIT: %d", limit)

			response, err := c.runPage(ctx, sql.Command, entity, page, limit)
			if err != nil {
				return err
			}
			for len(response) > 0 {
				if ctx.Err() != nil {
					return ctx.Err()
				}
				raw := rowsToAny(response)
				dataRows := raw
				if hydrate {
					dataRows = make([]any, len(response))
					for i, r := range response {
						dataRows[i] = c.hydrator.Hydrate(schema.Maps, r)
					}
				}
				if c.setting.Channel != "SAAS_S3" {
					if err := c.parallel(ctx, func() { c.utils.WriteJSON("raw-"+resourceName, raw, false) },
						func() error { return c.transport.Send(ctx, "raw/"+resourceName, raw) }); err != nil {
						return err
					}
					c.utils.WaitCtx(ctx.Done(), c.env.Throttle())
				}
				resource := schema.APIResource
				if c.setting.Channel == "SAAS_S3" {
					resource = schema.Entity
				}
				if resource == "" {
					resource = schema.Entity
				}
				if err := c.parallel(ctx, func() { c.utils.WriteJSON(resourceName, dataRows, false) },
					func() error { return c.transport.Send(ctx, resource, dataRows) }); err != nil {
					return err
				}
				c.utils.WaitCtx(ctx.Done(), c.env.Throttle())
				page++
				if response, err = c.runPage(ctx, sql.Command, entity, page, limit); err != nil {
					return err
				}
			}
		}
		c.logger.Infof("ENTITY %s EXTRACTION COMPLETED IN %s", entity, core.FormatDuration(float64(time.Since(entityStart).Milliseconds())))
	}
	c.logger.Infof("TOTAL EXTRACTION COMPLETED IN %s", core.FormatDuration(float64(time.Since(totalStart).Milliseconds())))
	return nil
}

func (c *Database) parallel(ctx context.Context, write func(), send func() error) error {
	var wg sync.WaitGroup
	wg.Add(1)
	go func() { defer wg.Done(); write() }()
	err := send()
	wg.Wait()
	return err
}

func (c *Database) runPage(ctx context.Context, command, entity string, page, limit int) ([]*core.Row, error) {
	started := time.Now()
	rows, err := c.db.Query(ctx, command, &page, limit)
	if err != nil {
		suffix := ""
		if page > 0 {
			suffix = fmt.Sprintf(" PAGE %d", page)
		}
		c.logger.Errorf("SQL QUERY FAILED FOR ENTITY %s%s: %s", entity, suffix, err.Error())
		return nil, err
	}
	c.logger.Infof("SQL QUERY [%s] PAGE %d RETURNED %d ROWS IN %s", entity, page, len(rows), core.FormatDuration(float64(time.Since(started).Milliseconds())))
	return rows, nil
}
