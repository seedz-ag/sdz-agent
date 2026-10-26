package control

import (
	"bufio"
	"context"
	"encoding/json"
	"errors"
	"net"
	"time"
)

// Client sends one request and reads one response over the local channel.
type Client struct {
	Timeout time.Duration
}

func NewClient() *Client { return &Client{Timeout: 60 * time.Second} }

func (c *Client) Send(ctx context.Context, req ControlRequest) (ControlResponse, error) {
	timeout := c.Timeout
	if timeout <= 0 {
		timeout = 60 * time.Second
	}
	ctx, cancel := context.WithTimeout(ctx, timeout)
	defer cancel()
	conn, err := dial(ctx)
	if err != nil {
		return ControlResponse{}, err
	}
	defer conn.Close()
	_ = conn.SetDeadline(time.Now().Add(timeout))

	payload, err := json.Marshal(req)
	if err != nil {
		return ControlResponse{}, err
	}
	if _, err := conn.Write(append(payload, '\n')); err != nil {
		return ControlResponse{}, err
	}
	reader := bufio.NewReaderSize(conn, 1<<20)
	line, err := reader.ReadBytes('\n')
	if err != nil && len(line) == 0 {
		return ControlResponse{}, errors.New("service closed the connection")
	}
	var resp ControlResponse
	if err := json.Unmarshal(line, &resp); err != nil {
		return ControlResponse{}, errors.New("invalid response")
	}
	return resp, nil
}

func (c *Client) Status(ctx context.Context) (ControlResponse, error) {
	return c.Send(ctx, ControlRequest{Op: "status"})
}
func (c *Client) Run(ctx context.Context) (ControlResponse, error) {
	return c.Send(ctx, ControlRequest{Op: "run"})
}
func (c *Client) Ping(ctx context.Context) (ControlResponse, error) {
	return c.Send(ctx, ControlRequest{Op: "ping"})
}
func (c *Client) Logs(ctx context.Context, lines int) (ControlResponse, error) {
	return c.Send(ctx, ControlRequest{Op: "logs", Lines: lines})
}

// ExportLogs returns every logs/agent-*.log line (oldest first, capped by the service).
func (c *Client) ExportLogs(ctx context.Context) (ControlResponse, error) {
	return c.Send(ctx, ControlRequest{Op: "exportlogs"})
}

func (c *Client) ClearLogs(ctx context.Context) (ControlResponse, error) {
	return c.Send(ctx, ControlRequest{Op: "clearlogs"})
}

// ClearCredentials removes the saved credentials; the service idles until the next Configure.
func (c *Client) ClearCredentials(ctx context.Context) (ControlResponse, error) {
	return c.Send(ctx, ControlRequest{Op: "clear"})
}
func (c *Client) Configure(ctx context.Context, clientID, clientSecret, apiURL string) (ControlResponse, error) {
	return c.Send(ctx, ControlRequest{Op: "configure", ClientID: clientID, ClientSecret: clientSecret, APIURL: apiURL})
}

var errNoService = errors.New("SDZ Agent service is not running (no control socket found)")

func dialUnixCandidates(ctx context.Context) (net.Conn, error) {
	var last error
	d := net.Dialer{}
	for _, path := range ClientSocketCandidates() {
		if !fileExists(path) {
			continue
		}
		conn, err := d.DialContext(ctx, "unix", path)
		if err == nil {
			return conn, nil
		}
		last = err
	}
	if last != nil {
		return nil, errors.Join(errNoService, last)
	}
	return nil, errNoService
}
