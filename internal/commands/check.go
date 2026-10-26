package commands

import (
	"context"
	"fmt"
	"io"
	"net"
	"net/http"
	"net/url"
	"time"

	"github.com/seedz-ag/sdz-agent-go/internal/api"
	"github.com/seedz-ag/sdz-agent-go/internal/consumers"
	"github.com/seedz-ag/sdz-agent-go/internal/core"
)

type ConnectionSpeed struct{ Download, Upload string }

type CheckResult struct {
	Type            string
	Auth            bool
	DataSource      bool
	DNS             bool
	ConnectionSpeed *ConnectionSpeed
}

// Check is the port of CheckCommand (auth | datasource | dns | speed | all).
type Check struct {
	api       *api.Service
	consumers *consumers.Resolver
	env       *core.Env
	http      *core.HTTPClient
}

func NewCheck(a *api.Service, r *consumers.Resolver, env *core.Env, http *core.HTTPClient) *Check {
	return &Check{api: a, consumers: r, env: env, http: http}
}

func (c *Check) Run(ctx context.Context, typ string) CheckResult {
	r := CheckResult{Type: typ}
	all := typ == "all"
	if all || typ == "auth" {
		r.Auth = c.CheckAuth(ctx)
	}
	if all || typ == "dns" {
		r.DNS = c.checkDNS(ctx)
	}
	if all || typ == "datasource" {
		r.DataSource = c.checkDataSource(ctx)
	}
	if all || typ == "speed" {
		if s, err := c.checkSpeed(ctx); err == nil {
			r.ConnectionSpeed = s
		}
	}
	return r
}

func (c *Check) CheckAuth(ctx context.Context) bool {
	_, err := c.http.Post(ctx, c.env.APIURL()+"auth", map[string]string{"clientId": c.env.ClientID(), "clientSecret": c.env.ClientSecret()}, nil, 10_000)
	return err == nil
}

func (c *Check) checkDNS(ctx context.Context) bool {
	u, err := url.Parse(c.env.APIURL())
	if err != nil {
		return false
	}
	addrs, err := net.DefaultResolver.LookupHost(ctx, u.Hostname())
	return err == nil && len(addrs) > 0
}

func (c *Check) checkDataSource(ctx context.Context) bool {
	setting, err := c.api.GetSetting(ctx)
	if err != nil {
		return false
	}
	consumer, err := c.consumers.Resolve(setting.DataSource)
	if err != nil {
		return false
	}
	consumer.SetSetting(setting)
	return consumer.Consume(ctx) == nil
}

func (c *Check) checkSpeed(ctx context.Context) (*ConnectionSpeed, error) {
	const downloadBytes, uploadBytes = 10_000_000, 5_000_000
	client := &http.Client{Timeout: 2 * time.Minute}
	started := time.Now()
	resp, err := client.Get(fmt.Sprintf("https://eu.httpbin.org/stream-bytes/%d", downloadBytes))
	if err != nil {
		return nil, err
	}
	n, _ := io.Copy(io.Discard, resp.Body)
	resp.Body.Close()
	download := mbps(n, time.Since(started))
	started = time.Now()
	up, err := client.Post("https://eu.httpbin.org/post", "application/octet-stream", io.LimitReader(zeroReader{}, uploadBytes))
	if err != nil {
		return nil, err
	}
	up.Body.Close()
	return &ConnectionSpeed{Download: download, Upload: mbps(uploadBytes, time.Since(started))}, nil
}

type zeroReader struct{}

func (zeroReader) Read(p []byte) (int, error) {
	for i := range p {
		p[i] = 0
	}
	return len(p), nil
}

func mbps(bytes int64, d time.Duration) string {
	if d.Seconds() <= 0 {
		return "0.00"
	}
	return fmt.Sprintf("%.2f", float64(bytes)*8/1_000_000/d.Seconds())
}
