package control

import (
	"bufio"
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"net"
	"net/url"
	"os"
	"path/filepath"
	"sort"
	"strings"
	"time"

	"github.com/seedz-ag/sdz-agent-go/internal/core"
	"github.com/seedz-ag/sdz-agent-go/internal/state"
)

// Handlers are the operations the service exposes; wired by main from the commands package.
type Handlers struct {
	Status    func() state.Status
	Configure func(ctx context.Context, clientID, clientSecret, apiURL string) error
	// Clear removes the saved credentials and puts the scheduler to idle.
	Clear     func() error
	Run       func(ctx context.Context) error
	IsRunning func() bool
	Logs      func(n int) []string
	ClearLogs func() (int, error)
}

// ErrInvalidCredentials is returned by Handlers.Configure when the API rejects the pair.
var ErrInvalidCredentials = errors.New("INVALID CREDENTIALS")

type Server struct {
	env      *core.Env
	paths    *core.Paths
	logger   *core.Logger
	handlers Handlers
	// RunContext is used for background extractions started through the channel.
	RunContext context.Context
}

func NewServer(env *core.Env, paths *core.Paths, logger *core.Logger, handlers Handlers) *Server {
	return &Server{env: env, paths: paths, logger: logger, handlers: handlers, RunContext: context.Background()}
}

// Serve blocks until ctx is done.
func (s *Server) Serve(ctx context.Context) error {
	listener, addr, err := s.listen()
	if err != nil {
		s.logger.Error("CONTROL CHANNEL STOPPED", err.Error())
		return err
	}
	s.logger.Infof("CONTROL CHANNEL LISTENING ON %s", addr)
	go func() {
		<-ctx.Done()
		listener.Close()
	}()
	defer s.cleanup(addr)
	for {
		conn, err := listener.Accept()
		if err != nil {
			if ctx.Err() != nil {
				return nil
			}
			var ne net.Error
			if errors.As(err, &ne) && ne.Timeout() {
				continue
			}
			time.Sleep(200 * time.Millisecond)
			continue
		}
		go s.handle(ctx, conn)
	}
}

func (s *Server) handle(ctx context.Context, conn net.Conn) {
	defer conn.Close()
	_ = conn.SetDeadline(time.Now().Add(2 * time.Minute))
	reader := bufio.NewReaderSize(conn, 1<<20)
	line, err := reader.ReadBytes('\n')
	if err != nil && len(line) == 0 {
		return
	}
	var req ControlRequest
	resp := ControlResponse{}
	if err := json.Unmarshal(line, &req); err != nil {
		resp = Failure(err.Error())
	} else {
		resp = s.dispatch(ctx, req)
	}
	out, err := json.Marshal(resp)
	if err != nil {
		out, _ = json.Marshal(Failure(err.Error()))
	}
	_, _ = conn.Write(append(out, '\n'))
}

func (s *Server) dispatch(ctx context.Context, req ControlRequest) (resp ControlResponse) {
	defer func() {
		if r := recover(); r != nil {
			resp = Failure(fmt.Sprint(r))
		}
	}()
	switch strings.ToLower(req.Op) {
	case "ping":
		return Success("pong")
	case "status":
		st := s.handlers.Status()
		if s.handlers.IsRunning != nil {
			st.Running = s.handlers.IsRunning()
		}
		return ControlResponse{Ok: true, Status: &st}
	case "exportlogs":
		lines, err := ReadAllLogs(s.paths, MaxExportLines)
		if err != nil {
			return Failure(err.Error())
		}
		return ControlResponse{Ok: true, Logs: lines}
	case "logs":
		n := req.Lines
		if n <= 0 {
			n = 100
		}
		if n > 2000 {
			n = 2000
		}
		return ControlResponse{Ok: true, Logs: s.handlers.Logs(n)}
	case "clearlogs":
		removed, err := s.handlers.ClearLogs()
		if err != nil {
			return Failure(err.Error())
		}
		s.logger.Infof("LOGS CLEARED (%d FILES)", removed)
		return Success(fmt.Sprintf("%d ARQUIVO(S) DE LOG REMOVIDO(S)", removed))
	case "run":
		if s.handlers.IsRunning != nil && s.handlers.IsRunning() {
			return Failure("EXTRACTION ALREADY RUNNING")
		}
		if !s.handlers.Status().Configured {
			return Failure("AGENT NOT CONFIGURED")
		}
		go func() { _ = s.handlers.Run(s.RunContext) }()
		return Success("EXTRACTION STARTED")
	case "configure":
		if strings.TrimSpace(req.ClientID) == "" || strings.TrimSpace(req.ClientSecret) == "" {
			return Failure("CLIENT ID AND CLIENT SECRET ARE REQUIRED")
		}
		apiURL := strings.TrimSpace(req.APIURL)
		if apiURL == "" {
			apiURL = DefaultAPIURL
		}
		if !strings.HasSuffix(apiURL, "/") {
			apiURL += "/"
		}
		if u, err := url.Parse(apiURL); err != nil || u.Scheme == "" || u.Host == "" {
			return Failure("INVALID API URL")
		}
		if err := s.handlers.Configure(ctx, strings.TrimSpace(req.ClientID), strings.TrimSpace(req.ClientSecret), apiURL); err != nil {
			return Failure(err.Error())
		}
		return Success("CONFIGURATION SAVED")
	case "clear":
		if s.handlers.Clear == nil {
			return Failure("UNSUPPORTED OPERATION 'clear'")
		}
		if s.handlers.IsRunning != nil && s.handlers.IsRunning() {
			return Failure("EXTRACTION RUNNING, TRY AGAIN LATER")
		}
		if err := s.handlers.Clear(); err != nil {
			return Failure(err.Error())
		}
		s.logger.Warn("CREDENTIALS REMOVED THROUGH THE CONTROL CHANNEL, SCHEDULER IDLE UNTIL CONFIGURED")
		return Success("CREDENTIALS REMOVED")
	default:
		return Failure(fmt.Sprintf("UNKNOWN OPERATION '%s'", req.Op))
	}
}

// DefaultAPIURL is the production integration API.
const DefaultAPIURL = "https://api.integration.seedz.ag/integration/v1/"

// MaxExportLines caps an export (oldest lines are dropped first).
const MaxExportLines = 200_000

// ExportFileName is the default name for an exported log file.
func ExportFileName() string {
	return "sdz-agent-logs-" + time.Now().Format("20060102-150405") + ".txt"
}

// ReadAllLogs returns every logs/agent-*.log line (oldest file first) as "timestamp level message".
// The error is non-nil when the folder exists but cannot be read (callers may ask the service instead).
func ReadAllLogs(paths *core.Paths, max int) ([]string, error) {
	matches, err := filepath.Glob(filepath.Join(paths.LogsDir(), "agent-*.log"))
	if err != nil {
		return nil, err
	}
	sort.Strings(matches)
	out := []string{}
	for _, m := range matches {
		raw, err := os.ReadFile(m)
		if err != nil {
			return nil, err
		}
		for _, l := range strings.Split(strings.TrimRight(string(raw), "\n"), "\n") {
			if strings.TrimSpace(l) != "" {
				out = append(out, formatLogLine(l))
			}
		}
	}
	if len(out) > max {
		out = out[len(out)-max:]
	}
	return out, nil
}

// WriteLogExport writes the exported lines with a short header.
func WriteLogExport(w io.Writer, lines []string, header string) error {
	bw := bufio.NewWriter(w)
	fmt.Fprintf(bw, "# SDZ Agent %s - logs exportados em %s (%d linhas)\n", core.Version, time.Now().Format("2006-01-02 15:04:05"), len(lines))
	if header != "" {
		fmt.Fprintf(bw, "# %s\n", header)
	}
	for _, l := range lines {
		bw.WriteString(l)
		bw.WriteByte('\n')
	}
	return bw.Flush()
}

func formatLogLine(l string) string {
	var arr []string
	if err := json.Unmarshal([]byte(l), &arr); err == nil && len(arr) >= 3 {
		// stored as [level, timestamp, message...]
		return fmt.Sprintf("%s %5s %s", arr[1], arr[0], strings.Join(arr[2:], " "))
	}
	return l
}

// TailLogs returns the last n lines of the newest logs/agent-*.log as "timestamp level message".
func TailLogs(paths *core.Paths, n int) []string {
	matches, _ := filepath.Glob(filepath.Join(paths.LogsDir(), "agent-*.log"))
	if len(matches) == 0 {
		return []string{}
	}
	sort.Strings(matches)
	raw, err := os.ReadFile(matches[len(matches)-1])
	if err != nil {
		return []string{}
	}
	lines := strings.Split(strings.TrimRight(string(raw), "\n"), "\n")
	if len(lines) > n {
		lines = lines[len(lines)-n:]
	}
	out := make([]string, 0, len(lines))
	for _, l := range lines {
		if strings.TrimSpace(l) == "" {
			continue
		}
		var arr []string
		if err := json.Unmarshal([]byte(l), &arr); err == nil && len(arr) >= 3 {
			// stored as [level, timestamp, message...]
			out = append(out, fmt.Sprintf("%s %5s %s", arr[1], arr[0], strings.Join(arr[2:], " ")))
			continue
		}
		out = append(out, l)
	}
	return out
}

// ClearLogs deletes logs/*.log (output/*.log are pending shipments and are kept).
func ClearLogs(paths *core.Paths) (int, error) {
	matches, _ := filepath.Glob(filepath.Join(paths.LogsDir(), "*.log"))
	removed := 0
	for _, m := range matches {
		if err := os.Remove(m); err == nil {
			removed++
		}
	}
	return removed, nil
}
