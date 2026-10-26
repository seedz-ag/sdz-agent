// Package commands implements the agent verbs (port of src/commands/*.ts).
package commands

import (
	"context"
	"errors"
	"fmt"
	"strings"
	"sync"

	"github.com/seedz-ag/sdz-agent-go/internal/api"
	"github.com/seedz-ag/sdz-agent-go/internal/consumers"
	"github.com/seedz-ag/sdz-agent-go/internal/core"
	"github.com/seedz-ag/sdz-agent-go/internal/services"
	"github.com/seedz-ag/sdz-agent-go/internal/transports"
)

// Execute runs one full extraction: setting → VPN → transport → consumer → touch.
type Execute struct {
	api       *api.Service
	consumers *consumers.Resolver
	env       *core.Env
	httpT     *transports.HTTP
	s3T       *transports.S3
	logger    *core.Logger
	utils     *core.Utils
	vpn       *services.VPN
	mu        sync.Mutex
	running   bool
}

func NewExecute(a *api.Service, r *consumers.Resolver, env *core.Env, httpT *transports.HTTP, s3T *transports.S3, logger *core.Logger, utils *core.Utils, vpn *services.VPN) *Execute {
	return &Execute{api: a, consumers: r, env: env, httpT: httpT, s3T: s3T, logger: logger, utils: utils, vpn: vpn}
}

func (e *Execute) IsRunning() bool {
	e.mu.Lock()
	defer e.mu.Unlock()
	return e.running
}

func (e *Execute) Run(ctx context.Context) error {
	e.mu.Lock()
	if e.running {
		e.mu.Unlock()
		return errors.New("EXTRACTION ALREADY RUNNING")
	}
	e.running = true
	e.mu.Unlock()
	defer func() {
		e.mu.Lock()
		e.running = false
		e.mu.Unlock()
	}()
	err := e.run(ctx)
	if e.vpn.IsConnected() {
		_ = e.vpn.Disconnect()
	}
	return err
}

func (e *Execute) run(ctx context.Context) error {
	if e.env.EnvName() != "" {
		d, err := e.api.Discovery(ctx)
		if err != nil {
			e.logger.Errorf("SDZ-AGENT EXECUTE ERROR: %s", err.Error())
			return err
		}
		e.env.SetDiscovery(d)
	}
	e.api.EnableFileLogging()
	e.logger.Info("STARTING EXECUTE COMMAND")
	e.logger.Info("CLEANING CSV FILES")
	e.utils.CleanOutput("csv")
	e.logger.Info("CLEANING JSON FILES")
	e.utils.CleanOutput("json")
	e.logger.Info("CLEANING SQL FILES")
	e.utils.CleanOutput("sql")
	e.logger.Info("CLEANING OVPN FILES")
	e.utils.CleanOutput("ovpn", "txt")

	setting, err := e.api.GetSetting(ctx)
	if err != nil {
		detail := err.Error()
		if re := core.AsRequestError(err); re != nil {
			detail = re.Describe()
		}
		e.logger.Error("SDZ-AGENT ERROR WHILING FIND SETTING:", detail)
		err = errors.New("SDZ-AGENT COULDN'T FIND SETTING, ABORTING.")
		e.logger.Errorf("SDZ-AGENT EXECUTE ERROR: %s", err.Error())
		return err
	}
	if setting.Security != nil {
		e.logger.Info("CONNECTING TO VPN.")
		if err := e.vpn.Configure(setting.Security).Connect(); err != nil {
			e.logger.Errorf("SDZ-AGENT EXECUTE ERROR: %s", err.Error())
			return err
		}
	}
	channel := strings.ToUpper(setting.Channel)
	e.logger.Infof("RESOLVING TRANSPORT: %s", channel)
	var transport transports.Transport
	switch channel {
	case "AGENT", "SAAS":
		transport = e.httpT
	case "SAAS_S3":
		e.s3T.SetSetting(setting)
		transport = e.s3T
	default:
		err := errors.New("TRANSPORT NOT FOUND")
		e.logger.Errorf("SDZ-AGENT EXECUTE ERROR: %s", err.Error())
		return err
	}
	e.logger.Info("TRANSPORT RESOLVED")
	consumer, err := e.consumers.Resolve(setting.DataSource)
	if err != nil {
		e.logger.Errorf("SDZ-AGENT EXECUTE ERROR: %s", err.Error())
		return err
	}
	consumer.SetSetting(setting).SetTransport(transport)
	e.logger.Info("STARTING CONSUMER")
	if err := consumer.Consume(ctx); err != nil {
		e.logger.Errorf("SDZ-AGENT EXECUTE ERROR: %s", err.Error())
		return err
	}
	e.logger.Info("CONSUMER DONE")
	e.api.TouchSetting(ctx)
	e.logger.Info("ENDING PROCESS")
	return nil
}

// ErrNotConfigured is returned by commands that need credentials.
var ErrNotConfigured = fmt.Errorf("AGENT NOT CONFIGURED")
