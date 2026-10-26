package commands

import (
	"bufio"
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"os/exec"
	"runtime"
	"strconv"
	"strings"
	"sync"
	"sync/atomic"
	"time"

	"github.com/seedz-ag/sdz-agent-go/internal/api"
	"github.com/seedz-ag/sdz-agent-go/internal/core"
	"github.com/seedz-ag/sdz-agent-go/internal/data"
	"github.com/seedz-ag/sdz-agent-go/internal/telemetry/collector"
	"github.com/seedz-ag/sdz-agent-go/internal/update"
)

// Listen keeps the GET /commands stream open and dispatches Execute/Query/Shell/Response/Ping.
type Listen struct {
	// Updates serves the remote "Update" command (set by main; nil disables it).
	Updates *update.Service

	mu        sync.Mutex
	conn      context.CancelFunc
	connected atomic.Bool
	idle      atomic.Pointer[IdleTimer]
	wake      chan struct{}

	api       *api.Service
	db        *data.Dispatcher
	env       *core.Env
	execute   *Execute
	http      *core.HTTPClient
	logger    *core.Logger
	telemetry *collector.Service
}

func NewListen(a *api.Service, db *data.Dispatcher, env *core.Env, e *Execute, http *core.HTTPClient, logger *core.Logger, t *collector.Service) *Listen {
	return &Listen{api: a, db: db, env: env, execute: e, http: http, logger: logger, telemetry: t}
}

// Run blocks until the stream closes (nil) or fails (error).
// ListenIdleTimeout: the API sends a Ping every 30 s, so this long without any byte means a dead connection.
const ListenIdleTimeout = 90 * time.Second

// Connected reports whether a /commands stream is open right now.
func (l *Listen) Connected() bool { return l.connected.Load() }

// Reconnect drops the current connection so RunForever opens a new one (e.g. with new credentials).
func (l *Listen) Reconnect() {
	l.mu.Lock()
	cancel := l.conn
	l.mu.Unlock()
	if cancel != nil {
		cancel()
	}
	// also cut a backoff wait short
	select {
	case l.wakeCh() <- struct{}{}:
	default:
	}
}

func (l *Listen) wakeCh() chan struct{} {
	l.mu.Lock()
	defer l.mu.Unlock()
	if l.wake == nil {
		l.wake = make(chan struct{}, 1)
	}
	return l.wake
}

// RunForever keeps the command channel open for the whole life of the process: it reconnects after
// any close, error, idle timeout or Reconnect, with a short backoff (2 s -> 60 s, reset after a
// connection that lasted more than a minute), and waits while the agent has no credentials.
func (l *Listen) RunForever(ctx context.Context) {
	delays := []time.Duration{2 * time.Second, 5 * time.Second, 10 * time.Second, 30 * time.Second, 60 * time.Second}
	attempt := 0
	for ctx.Err() == nil {
		if l.env.ClientID() == "" || l.env.ClientSecret() == "" {
			select {
			case <-ctx.Done():
				return
			case <-time.After(2 * time.Second):
			}
			continue
		}
		connCtx, cancel := context.WithCancel(ctx)
		l.mu.Lock()
		l.conn = cancel
		l.mu.Unlock()
		started := time.Now()
		err := l.Run(connCtx)
		reconnectAsked := connCtx.Err() != nil && ctx.Err() == nil
		cancel()
		l.mu.Lock()
		l.conn = nil
		l.mu.Unlock()
		if ctx.Err() != nil {
			return
		}
		if reconnectAsked {
			attempt = 0
			continue
		}
		if err != nil {
			l.logger.Error("LISTEN ERROR", err.Error())
		}
		if time.Since(started) > time.Minute {
			attempt = 0
		}
		delay := delays[min(attempt, len(delays)-1)]
		attempt++
		l.logger.Warnf("COMMANDS STREAM DOWN, RECONNECTING IN %dS", int(delay.Seconds()))
		select {
		case <-ctx.Done():
			return
		case <-time.After(delay):
		case <-l.wakeCh():
			attempt = 0
		}
	}
}

// RunSession is the `listen` CLI command: up to retries connections and, when --session-ttl /
// SESSION_TTL is set, an idle shutdown after N minutes without an effective command.
// Returns true when the session ended by TTL.
func (l *Listen) RunSession(ctx context.Context, retries int) bool {
	session, cancel := context.WithCancel(ctx)
	defer cancel()
	var closedByTTL atomic.Bool
	if minutes := l.env.SessionTTLMinutes(); minutes > 0 {
		t := NewIdleTimerMinutes(minutes, func(idleFor time.Duration) {
			closedByTTL.Store(true)
			l.logger.Infof("IDLE FOR %ds WITH TTL %sm — CLOSING SESSION", int(idleFor.Seconds()), strconv.FormatFloat(minutes, 'f', -1, 64))
			cancel()
		}).Start()
		l.idle.Store(t)
		defer func() { t.Stop(); l.idle.Store(nil) }()
		l.logger.Infof("SESSION TTL %sm", strconv.FormatFloat(minutes, 'f', -1, 64))
	}
	for retries > 0 && session.Err() == nil {
		retries--
		if err := l.Run(session); err != nil && session.Err() == nil {
			if re := core.AsRequestError(err); re != nil && re.IsTimeout() {
				fmt.Println("CONNECTION ABORTED, POSSIBLY AN INTERNET CONNECTION PROBLEM, PLEASE RUN AGENT CHECK FOR MORE INFORMATION")
				break
			}
			l.logger.Error(err.Error())
		}
	}
	// a stream that drops after the TTL is not a failure: it is the exit we asked for
	if closedByTTL.Load() {
		l.logger.Info("SESSION CLOSED BY TTL")
	}
	return closedByTTL.Load()
}

func (l *Listen) Run(ctx context.Context) error {
	l.telemetry.Start("listen")
	l.logger.Info("START LISTENING COMMANDS")
	headers := map[string]string{"Authorization": api.BasicAuth(l.env.ClientID(), l.env.ClientSecret())}
	l.logger.Info("STREAM OPEN")
	body, _, err := l.http.Stream(ctx, core.Request{URL: l.env.APIURL() + "commands", Method: "GET", Headers: headers, Timeout: 2_147_483_647})
	if err != nil {
		if re := core.AsRequestError(err); re != nil {
			l.logger.Infof("STREAM CLOSED %d - %s", re.StatusCode, re.StatusText)
		}
		return err
	}
	defer body.Close()
	l.connected.Store(true)
	defer l.connected.Store(false)
	// watchdog: any line (the 30 s Ping included) re-arms it; silence closes the stream so we reconnect
	streamCtx, stopStream := context.WithCancel(ctx)
	defer stopStream()
	idle := time.AfterFunc(ListenIdleTimeout, func() {
		l.logger.Warnf("NO DATA FROM THE COMMANDS STREAM IN %dS, RECONNECTING", int(ListenIdleTimeout.Seconds()))
		stopStream()
		_ = body.Close()
	})
	defer idle.Stop()
	go func() { <-streamCtx.Done(); _ = body.Close() }()
	sc := bufio.NewScanner(body)
	sc.Buffer(make([]byte, 1024*1024), 8*1024*1024)
	var buf strings.Builder
	for sc.Scan() {
		idle.Reset(ListenIdleTimeout)
		if ctx.Err() != nil {
			return ctx.Err()
		}
		line := strings.TrimSpace(sc.Text())
		if line == "" {
			continue
		}
		buf.WriteString(line)
		var msg api.CommandMessage
		if err := json.Unmarshal([]byte(buf.String()), &msg); err != nil {
			if buf.Len() > 1_000_000 {
				buf.Reset()
			}
			continue // partial frame
		}
		buf.Reset()
		go l.handle(ctx, msg)
	}
	l.logger.Info("STREAM CLOSED")
	if err := sc.Err(); err != nil && ctx.Err() == nil && streamCtx.Err() == nil {
		return err
	}
	return nil
}

func (l *Listen) handle(ctx context.Context, msg api.CommandMessage) {
	// session TTL: only an effective command postpones the shutdown (Ping does not)
	if t := l.idle.Load(); t != nil {
		t.Touch(msg.Command)
	}
	args, _ := msg.Arguments.([]any)
	var result any
	var err error
	switch msg.Command {
	case "Ping":
		return
	case "Response":
		l.logger.Info(core.MustJSON(msg.Arguments))
		return
	case "Execute":
		_ = l.env.Parse()
		result, err = l.listenExecute(ctx, args)
	case "Query":
		_ = l.env.Parse()
		result, err = l.listenQuery(ctx, args)
	case "Shell":
		result, err = listenShell(ctx, args)
	case "Update":
		l.listenUpdate(ctx, msg.Sender, args)
		return
	default:
		l.logger.Warnf("UNKNOWN COMMAND %s", msg.Command)
		return
	}
	if err != nil {
		l.logger.Error(err.Error())
		return
	}
	if msg.Sender != "" {
		l.respond(ctx, msg.Sender, result)
	}
}

// mergeArgs: arguments is an array of arrays of {arg, value}; each pair becomes an env override.
func (l *Listen) mergeArgs(args []any) {
	merged := map[string]string{}
	for _, group := range args {
		items, _ := group.([]any)
		for _, item := range items {
			m, _ := item.(map[string]any)
			arg, _ := m["arg"].(string)
			if arg == "" {
				continue
			}
			key := strings.ReplaceAll(strings.ReplaceAll(arg, "--", ""), "=", "")
			merged[key] = strings.TrimSpace(core.Stringify(m["value"]))
		}
	}
	if len(merged) > 0 {
		_ = l.env.Merge(merged)
	}
}

func (l *Listen) listenExecute(ctx context.Context, args []any) (any, error) {
	l.logger.Infof("COMMAND %s", core.MustJSON(args))
	l.mergeArgs(args)
	if err := l.execute.Run(ctx); err != nil {
		l.logger.Error("LISTEN EXECUTE ERROR", err.Error())
		return nil, err
	}
	return true, nil
}

var forbidden = map[string]bool{"UPDATE": true, "INSERT": true, "DELETE": true, "DROP": true, "TRUNCATE": true, "ALTER": true}

func (l *Listen) listenQuery(ctx context.Context, args []any) (any, error) {
	l.logger.Info("command", core.MustJSON(args))
	l.mergeArgs(args)
	env := l.env.EnvName()
	if env == "" {
		env = "DEV"
	}
	if env != "DEV" {
		d, err := l.api.Discovery(ctx)
		if err != nil {
			return err.Error(), nil
		}
		l.env.SetDiscovery(d)
	}
	var query string
	if len(args) > 0 {
		if cmd, ok := args[len(args)-1].([]any); ok {
			for _, item := range cmd {
				if m, ok := item.(map[string]any); ok && m["label"] == "query" {
					query, _ = m["value"].(string)
				}
			}
		}
	}
	if strings.TrimSpace(query) == "" {
		l.logger.Info("Query is Required")
		return "Query is Required.", nil
	}
	for _, tok := range strings.FieldsFunc(strings.ToUpper(query), func(r rune) bool { return r == ' ' || r == '\n' || r == '\r' || r == '\t' || r == '(' || r == ';' }) {
		if forbidden[tok] {
			return "ERROR", nil
		}
	}
	setting, err := l.api.GetSetting(ctx)
	if err != nil {
		l.logger.Error("LISTEN QUERY ERROR", err.Error())
		return err.Error(), nil
	}
	driver := strings.ToUpper(setting.Parameter("DATABASE_DRIVER"))
	if driver == "" {
		l.logger.Error("DATABASE DRIVER NOT FOUND")
		return nil, nil
	}
	if err := l.db.Initialize(ctx, driver, data.ConfigFromParameters(setting.Parameters), setting.Parameters); err != nil {
		return err.Error(), nil
	}
	result, err := l.db.ExecuteQueryRemote(ctx, query)
	if err != nil {
		return err.Error(), nil
	}
	l.logger.Info(result)
	return result, nil
}

func listenShell(ctx context.Context, args []any) (any, error) {
	if len(args) == 0 {
		return nil, errors.New("Command is Required.")
	}
	command := strings.TrimSpace(core.Stringify(args[len(args)-1]))
	if command == "" {
		return nil, errors.New("Command is Required.")
	}
	var cmd *exec.Cmd
	if runtime.GOOS == "windows" {
		cmd = exec.CommandContext(ctx, "cmd.exe", "/d", "/s", "/c", command)
	} else {
		cmd = exec.CommandContext(ctx, "/bin/sh", "-c", command)
	}
	var stdout, stderr strings.Builder
	cmd.Stdout, cmd.Stderr = &stdout, &stderr
	err := cmd.Run()
	if err != nil && stderr.Len() > 0 {
		return stderr.String(), nil
	}
	return stdout.String(), nil
}

func (l *Listen) respond(ctx context.Context, channel string, result any) {
	headers := map[string]string{
		"Authorization": api.BasicAuth(l.env.ClientID(), l.env.ClientSecret()),
		"Content-Type":  "application/json",
	}
	if _, err := l.http.Post(ctx, l.env.APIURL()+"commands", map[string]any{"arguments": []any{result}, "channel": channel, "command": "Response"}, headers, 0); err != nil {
		l.logger.Error(fmt.Sprintf("%v", err))
	}
}

// listenUpdate handles the remote "Update" command: answers the sender first, then launches the
// installer (which stops and restarts this service with the new version).
func (l *Listen) listenUpdate(ctx context.Context, sender string, args []any) {
	opts := update.ParseOptions(args)
	l.logger.Infof("REMOTE UPDATE REQUESTED %s", core.MustJSON(opts))
	var res update.Result
	var launch func() error
	switch {
	case l.Updates == nil:
		res = update.Result{Status: "error", Current: core.Version, Message: "self-update not available in this mode"}
	case l.execute.IsRunning() && !opts.Force && !opts.CheckOnly:
		res = update.Result{Status: "rejected", Current: core.Version, Message: "extraction in progress; retry later or send force"}
	default:
		res, launch = l.Updates.Prepare(ctx, opts)
	}
	l.logger.Infof("REMOTE UPDATE %s %s -> %s %s", strings.ToUpper(res.Status), res.Current, res.Target, res.Message)
	if sender != "" {
		l.respond(ctx, sender, res)
	}
	if launch != nil {
		time.Sleep(2 * time.Second) // let the response and the log page reach the API
		if err := launch(); err != nil {
			l.logger.Error("REMOTE UPDATE LAUNCH FAILED", err.Error())
		}
	}
}
