// sdz-agent: Seedz integration agent (Go edition).
package main

import (
	"context"
	"errors"
	"fmt"
	"os"
	"os/signal"
	"path/filepath"
	"strings"
	"syscall"
	"time"

	"github.com/seedz-ag/sdz-agent-go/internal/api"
	"github.com/seedz-ag/sdz-agent-go/internal/cli"
	"github.com/seedz-ag/sdz-agent-go/internal/commands"
	"github.com/seedz-ag/sdz-agent-go/internal/consumers"
	"github.com/seedz-ag/sdz-agent-go/internal/control"
	"github.com/seedz-ag/sdz-agent-go/internal/core"
	"github.com/seedz-ag/sdz-agent-go/internal/data"
	_ "github.com/seedz-ag/sdz-agent-go/internal/data/drivers"
	"github.com/seedz-ag/sdz-agent-go/internal/hosting"
	"github.com/seedz-ag/sdz-agent-go/internal/services"
	"github.com/seedz-ag/sdz-agent-go/internal/state"
	"github.com/seedz-ag/sdz-agent-go/internal/telemetry"
	"github.com/seedz-ag/sdz-agent-go/internal/telemetry/collector"
	"github.com/seedz-ag/sdz-agent-go/internal/transports"
	"github.com/seedz-ag/sdz-agent-go/internal/update"
)

const usage = `SDZ Agent %s

Usage: sdz-agent <command> [options]

Commands:
  run                 Service entrypoint: scheduler + listen, forever (what the OS service
                      manager starts). Outside a service manager it runs a single extraction.
  execute             One extraction now (-e ENV, -n DAYS, -q QUERY, -r, -s SCHEMA, -c)
  scheduler           Run the scheduler in the foreground (--no-listen, --no-forever)
  listen              Listen for remote commands only (--retries N, --session-ttl MINUTES:
                      close after N minutes without an effective command; Ping does not count)
  check <type>        auth | datasource | dns | speed | all
  credentials <action> set | show | test | clear  (terminal management of the credentials;
                      set: --client-id, --client-secret | --client-secret-stdin, --api-url,
                      --non-interactive, or SDZ_CLIENT_ID / SDZ_CLIENT_SECRET / SDZ_API_URL;
                      show --reveal; clear --yes). Applies to the running service at once.
  configure           Alias of 'credentials set'
  update [--check]    Check for a new release and install it
  service <action>    install | uninstall | start | stop | restart | status
  status              Live status from the running service (control channel)
  logs export         Save every log line to a text file (--output FILE; default: current folder)
  version             Print the version

Global options:
  -c, --use-console-log   Print logs to the console
  -v, --verbose
  --data-dir <path>       Override the data directory (or SDZ_AGENT_DATA_DIR)
`

// App wires every component (port of container.ts + Composition.cs).
type App struct {
	Env       *core.Env
	Paths     *core.Paths
	Logger    *core.Logger
	API       *api.Service
	Execute   *commands.Execute
	Check     *commands.Check
	Configure *commands.Configure
	Listen    *commands.Listen
	Scheduler *commands.Scheduler
	Logs      *services.Logs
	State     *state.State
	Telemetry *collector.Service
	Updates   *update.Service
	Runner    *commands.Runner
}

func buildApp(env *core.Env, paths *core.Paths) *App {
	logger := core.NewLogger()
	recorder := telemetry.NewRecorder()
	httpc := core.NewHTTPClient(recorder)
	utils := core.NewUtils(env, paths, logger)
	apiSvc := api.NewService(env, paths, httpc, logger, recorder, utils)
	st := state.New(env, paths)
	metrics := telemetry.NewSystemMetrics()
	tele := collector.New(env, paths, httpc, logger, recorder, collector.NewOutbox(paths), telemetry.NewSampler(metrics), metrics)
	hydrator := services.NewHydrator()
	interp := services.NewInterpolation()
	db := data.NewDispatcher(env, logger)
	dbConsumer := consumers.NewDatabase(db, env, paths, hydrator, logger, utils)
	ftpConsumer := consumers.NewFTP(env, paths, consumers.NewSFTPClient(logger), logger)
	httpConsumer := consumers.NewHTTP(env, paths, httpc, hydrator, interp, logger, utils)
	resolver := consumers.NewResolver(dbConsumer, ftpConsumer, httpConsumer, logger)
	httpT := transports.NewHTTP(apiSvc, env, utils, logger)
	s3T := transports.NewS3(apiSvc, env, logger, utils)
	vpn := services.NewVPN(paths, logger)
	exec := commands.NewExecute(apiSvc, resolver, env, httpT, s3T, logger, utils, vpn)
	check := commands.NewCheck(apiSvc, resolver, env, httpc)
	configure := commands.NewConfigure(httpc, paths)
	listen := commands.NewListen(apiSvc, db, env, exec, httpc, logger, tele)
	scheduler := commands.NewScheduler(apiSvc, env, exec, listen, logger, tele, st)
	logs := services.NewLogs(apiSvc, paths, logger)
	updates := update.New(env, paths, logger)
	listen.Updates = updates
	runner := &commands.Runner{Listen: listen, Env: env, Paths: paths, State: st, Scheduler: scheduler, Check: check, Logs: logs, Exec: exec, Config: configure, Logger: logger}
	return &App{Env: env, Paths: paths, Logger: logger, API: apiSvc, Execute: exec, Check: check, Configure: configure, Listen: listen,
		Scheduler: scheduler, Logs: logs, State: st, Telemetry: tele, Updates: updates, Runner: runner}
}

func (a *App) controlHandlers() control.Handlers {
	return control.Handlers{
		Status: func() state.Status {
			a.State.Running = a.Execute.IsRunning()
			if a.Runner.Scheduler.ExternalListen {
				a.State.Listening = a.Listen.Connected()
			}
			return a.State.Snapshot()
		},
		Configure: a.Runner.Configure,
		Clear:     a.Runner.Clear,
		Run:       a.Runner.Execute,
		IsRunning: a.Execute.IsRunning,
		Logs:      func(n int) []string { return control.TailLogs(a.Paths, n) },
		ClearLogs: func() (int, error) { return control.ClearLogs(a.Paths) },
	}
}

func main() { os.Exit(run(os.Args[1:])) }

func run(argv []string) int {
	args := cli.Parse(argv)
	command := strings.ToLower(args.Command)
	if command == "" || command == "help" || args.Has("help") {
		fmt.Printf(usage, core.Version)
		if command == "" {
			return 1
		}
		return 0
	}
	if command == "version" || args.Has("version") {
		fmt.Println(core.Version)
		return 0
	}
	if d := args.Get("data-dir"); d != "" {
		_ = os.Setenv(core.DataDirVariable, d)
	}
	paths := core.NewPaths()
	isService := hosting.IsServiceContext()

	if command == "service" {
		action := "status"
		if len(args.Positional) > 0 {
			action = args.Positional[0]
		}
		if err := hosting.Manage(action, paths); err != nil {
			fmt.Fprintln(os.Stderr, "✖", err)
			return 1
		}
		return 0
	}
	if command == "status" {
		return printStatus(paths)
	}
	if command == "logs" {
		return exportLogs(paths, args)
	}

	isCredentials := command == "configure" || command == "credentials"
	env, err := core.NewEnv(paths, isCredentials || (isService && command == "run"))
	if err != nil {
		var ve *core.ValidationError
		if errors.As(err, &ve) {
			fmt.Fprintln(os.Stderr, "✖", ve.Message)
			fmt.Fprintln(os.Stderr, "  Run `sdz-agent configure` to set CLIENT_ID / CLIENT_SECRET.")
			return 2
		}
		fmt.Fprintln(os.Stderr, "✖", err)
		return 2
	}
	overrides := map[string]string{}
	for k, v := range args.Options {
		switch k {
		case "data-dir", "help", "check", "non-interactive", "client-id", "client-secret", "client-secret-stdin", "api-url", "overwrite", "reveal", "yes":
			continue
		}
		overrides[k] = v
	}
	_ = env.Merge(overrides)

	if isService && command == "run" {
		env.Set("USE_CONSOLE_LOG", "true")
		return runService(env, paths)
	}

	app := buildApp(env, paths)
	logger := app.Logger
	if env.UseConsoleLog() || command == "scheduler" || command == "listen" {
		logger.Attach(core.NewConsoleSink())
	}
	var apiSink *core.APISink
	if !isCredentials {
		apiSink = core.NewAPISink(paths, func(page [][]string) bool { return app.API.SendLog(context.Background(), page) })
		logger.Attach(apiSink)
		defer func() {
			apiSink.Flush(2 * time.Minute)
			apiSink.Close()
		}()
	}

	ctx, stop := signal.NotifyContext(context.Background(), os.Interrupt, syscall.SIGTERM)
	defer stop()

	if !isCredentials {
		logger.Info("CONSUMING LOG")
		if err := app.Logs.ConsumeOutput(ctx); err != nil {
			logger.Error("IMPOSSIBLE TO CONSUME LOG, MAYBE ANOTHER TIME", err.Error())
		}
	}

	switch command {
	case "check":
		typ := "all"
		if len(args.Positional) > 0 {
			typ = strings.ToLower(args.Positional[0])
		}
		switch typ {
		case "auth", "datasource", "dns", "speed", "all":
		default:
			fmt.Fprintln(os.Stderr, "✖ check type must be one of: auth, datasource, dns, speed, all")
			return 1
		}
		env.Set("TYPE", typ)
		fmt.Println("RUNNING ...")
		r := app.Check.Run(ctx, typ)
		printCheck(r)
		switch typ {
		case "auth":
			return boolExit(r.Auth)
		case "datasource":
			return boolExit(r.DataSource)
		case "dns":
			return boolExit(r.DNS)
		case "speed":
			return boolExit(r.ConnectionSpeed != nil)
		default:
			return boolExit(r.Auth && r.DataSource)
		}
	case "configure", "credentials":
		action := "set"
		if command == "credentials" {
			action = "show"
			if len(args.Positional) > 0 {
				action = args.Positional[0]
			}
		}
		return commands.NewCredentials(app.Configure, paths).RunCLI(ctx, action, commands.CredentialsOptions{
			ClientID: args.Get("client-id"), ClientSecret: args.Get("client-secret"), APIURL: args.Get("api-url"),
			SecretFromStdin: args.Flag("client-secret-stdin", false),
			NonInteractive:  args.Flag("non-interactive", false),
			Reveal:          args.Flag("reveal", false),
			Yes:             args.Flag("yes", false) || args.Flag("overwrite", false) || args.Flag("non-interactive", false),
		})
	case "run", "execute":
		if !env.UseConsoleLog() {
			fmt.Println("RUNNING ...")
		}
		if err := app.Execute.Run(ctx); err != nil {
			if re := core.AsRequestError(err); re != nil {
				logger.Error(re.Describe())
			} else {
				logger.Error(err.Error())
			}
			fmt.Println("✖ ERROR")
			return 1
		}
		fmt.Println("✔ DONE")
		return 0
	case "listen":
		retries := 1
		if n := args.Get("retries"); n != "" {
			fmt.Sscanf(n, "%d", &retries)
		}
		if app.Listen.RunSession(ctx, retries) {
			fmt.Println("✔ SESSION CLOSED BY TTL")
		} else {
			fmt.Println("✖ STOPPED")
		}
		return 0
	case "scheduler":
		if !args.Has("listen") {
			env.Set("LISTEN", "true")
		}
		if !args.Has("forever") {
			env.Set("FOREVER", "true")
		}
		server := control.NewServer(env, paths, logger, app.controlHandlers())
		go func() { _ = server.Serve(ctx) }()
		if err := app.Scheduler.Run(ctx); err != nil {
			logger.Error(err.Error())
			fmt.Println("✖ ERROR")
			return 1
		}
		fmt.Println("✔ STOPPED")
		return 0
	case "update":
		version, err := app.Updates.CheckAndApply(ctx, !args.Flag("check", false))
		if err != nil {
			fmt.Fprintf(os.Stderr, "✖ UPDATE FAILED: %s (%s)\n", err, app.Updates.ManifestURL())
			return 1
		}
		if version == "" {
			fmt.Printf("✔ UP TO DATE (%s)\n", core.Version)
		} else if args.Flag("check", false) {
			fmt.Printf("ℹ UPDATE AVAILABLE: %s\n", version)
		} else {
			fmt.Printf("✔ UPDATE TO %s STARTED, THE SERVICE WILL RESTART\n", version)
		}
		return 0
	default:
		fmt.Fprintf(os.Stderr, "✖ unknown command '%s'\n", command)
		fmt.Printf(usage, core.Version)
		return 1
	}
}

func runService(env *core.Env, paths *core.Paths) int {
	_ = paths.EnsureDirectories()
	app := buildApp(env, paths)
	app.Logger.Attach(core.NewConsoleSink())
	apiSink := core.NewAPISink(paths, func(page [][]string) bool { return app.API.SendLog(context.Background(), page) })
	app.Logger.Attach(apiSink)
	ctx, stop := signal.NotifyContext(context.Background(), os.Interrupt, syscall.SIGTERM)
	defer stop()
	server := control.NewServer(env, paths, app.Logger, app.controlHandlers())
	err := hosting.RunUnderServiceManager(ctx, paths, func(ctx context.Context) error {
		return hosting.RunService(ctx, app.Runner, hosting.Deps{Env: env, Paths: paths, Logger: app.Logger, State: app.State, Control: server, Updates: app.Updates, Telemetry: app.Telemetry})
	})
	apiSink.Flush(20 * time.Second)
	apiSink.Close()
	if err != nil {
		app.Logger.Error("SERVICE STOPPED", err.Error())
		return 1
	}
	return 0
}

func printStatus(paths *core.Paths) int {
	client := &control.Client{Timeout: 10 * time.Second}
	resp, err := client.Status(context.Background())
	if err != nil {
		fmt.Printf("service not reachable (%s)\n", err)
		if err := hosting.Manage("status", paths); err != nil {
			fmt.Fprintln(os.Stderr, "✖", err)
			return 1
		}
		return 0
	}
	if resp.Status == nil {
		fmt.Fprintln(os.Stderr, "✖", resp.Message)
		return 1
	}
	s := resp.Status
	fmt.Printf("SDZ Agent %s (service running since %s)\n", s.Version, s.StartedAt.Format("2006-01-02 15:04"))
	fmt.Printf("  data dir:   %s\n", s.DataDir)
	if s.Configured {
		fmt.Printf("  configured: yes (client %s)\n", s.ClientID)
	} else {
		fmt.Println("  configured: no")
	}
	fmt.Printf("  api:        %s\n", s.APIURL)
	fmt.Printf("  auth:       %s\n", map[bool]string{true: "ok", false: "failed / not checked"}[s.AuthOK])
	fmt.Printf("  listening:  %s\n", map[bool]string{true: "yes", false: "no"}[s.Listening])
	sched := "-"
	if len(s.Schedules) > 0 {
		sched = strings.Join(s.Schedules, " | ")
	}
	fmt.Printf("  schedules:  %s\n", sched)
	fmt.Printf("  running:    %s\n", map[bool]string{true: "extraction in progress", false: "idle"}[s.Running])
	last := "-"
	if s.LastExecutionAt != nil {
		ok := "failed"
		if s.LastExecutionOK != nil && *s.LastExecutionOK {
			ok = "ok"
		}
		last = fmt.Sprintf("%s (%s)", s.LastExecutionAt.Format("2006-01-02 15:04:05"), ok)
	}
	fmt.Printf("  last run:   %s\n", last)
	next := "-"
	if s.NextRunAt != nil {
		next = s.NextRunAt.Format("2006-01-02 15:04:05")
	}
	fmt.Printf("  next run:   %s\n", next)
	if s.LastError != "" {
		fmt.Printf("  last error: %s\n", s.LastError)
	}
	return 0
}

func printCheck(r commands.CheckResult) {
	mark := func(ok bool) string {
		if ok {
			return "SUCCESS"
		}
		return "FAIL"
	}
	if r.Type == "all" || r.Type == "datasource" {
		fmt.Printf("    DATASOURCE: %s\n", mark(r.DataSource))
	}
	if r.Type == "all" || r.Type == "dns" {
		fmt.Printf("           DNS: %s\n", mark(r.DNS))
	}
	if r.Type == "all" || r.Type == "speed" {
		if r.ConnectionSpeed != nil {
			fmt.Printf("INTERNET SPEED: ▼ %s mbps / ▲ %s mbps\n", r.ConnectionSpeed.Download, r.ConnectionSpeed.Upload)
		} else {
			fmt.Println("INTERNET SPEED: NO CONNECTION")
		}
	}
	if r.Type == "all" || r.Type == "auth" {
		fmt.Printf("          AUTH: %s\n", mark(r.Auth))
	}
	fmt.Println("✔ DONE")
}

func boolExit(ok bool) int {
	if ok {
		return 0
	}
	return 1
}

// exportLogs is `sdz-agent logs export [--output FILE]`: reads logs/ directly, or asks the service when this user cannot.
func exportLogs(paths *core.Paths, args *cli.Args) int {
	if len(args.Positional) > 0 && args.Positional[0] != "export" {
		fmt.Fprintln(os.Stderr, "usage: sdz-agent logs export [--output FILE]")
		return 1
	}
	output := args.Get("output")
	if output == "" {
		cwd, _ := os.Getwd()
		output = filepath.Join(cwd, control.ExportFileName())
	}
	output, _ = filepath.Abs(output)

	source := paths.LogsDir()
	lines, err := control.ReadAllLogs(paths, control.MaxExportLines)
	if err != nil || len(lines) == 0 {
		resp, cerr := (&control.Client{Timeout: 60 * time.Second}).ExportLogs(context.Background())
		switch {
		case cerr == nil && resp.Ok:
			lines, source = resp.Logs, "running service"
		case err != nil:
			fmt.Fprintf(os.Stderr, "✖ COULD NOT READ THE LOGS (%s): %v\n", paths.LogsDir(), err)
			return 2
		}
	}
	if err := os.MkdirAll(filepath.Dir(output), 0o755); err != nil {
		fmt.Fprintf(os.Stderr, "✖ COULD NOT WRITE %s: %v\n", output, err)
		return 4
	}
	f, err := os.Create(output)
	if err == nil {
		err = control.WriteLogExport(f, lines, "origem: "+source)
		if cerr := f.Close(); err == nil {
			err = cerr
		}
	}
	if err != nil {
		fmt.Fprintf(os.Stderr, "✖ COULD NOT WRITE %s: %v\n", output, err)
		return 4
	}
	fmt.Printf("✔ %d LINES EXPORTED TO %s\n", len(lines), output)
	return 0
}
