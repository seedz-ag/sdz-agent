package core

import (
	"encoding/json"
	"fmt"
	"os"
	"path/filepath"
	"strings"
	"sync"
	"sync/atomic"
	"time"
)

// LogEntry is [timestamp, level, ...args], the shape the Node agent persisted and shipped.
type LogEntry struct {
	Timestamp string
	Level     string
	Args      []any
	LocalOnly bool
}

func (e LogEntry) Message() string {
	parts := make([]string, 0, len(e.Args))
	for _, a := range e.Args {
		parts = append(parts, stringifyArg(a))
	}
	return strings.Join(parts, " ")
}

func (e LogEntry) ToArray() []string {
	out := []string{e.Timestamp, e.Level}
	for _, a := range e.Args {
		out = append(out, stringifyArg(a))
	}
	return out
}

func stringifyArg(a any) string {
	switch t := a.(type) {
	case nil:
		return "null"
	case string:
		return t
	case error:
		return t.Error()
	default:
		return MustJSON(t)
	}
}

type LogSink interface {
	Write(entry LogEntry)
}

// Logger fans entries out to sinks (port of LoggerAdapter).
type Logger struct {
	mu    sync.RWMutex
	sinks []LogSink
}

func NewLogger() *Logger { return &Logger{} }

func (l *Logger) Attach(s LogSink) {
	l.mu.Lock()
	l.sinks = append(l.sinks, s)
	l.mu.Unlock()
}

func (l *Logger) Detach(s LogSink) {
	l.mu.Lock()
	for i, x := range l.sinks {
		if x == s {
			l.sinks = append(l.sinks[:i], l.sinks[i+1:]...)
			break
		}
	}
	l.mu.Unlock()
}

func (l *Logger) push(e LogEntry) {
	l.mu.RLock()
	sinks := append([]LogSink(nil), l.sinks...)
	l.mu.RUnlock()
	for _, s := range sinks {
		func() {
			defer func() { _ = recover() }()
			s.Write(e)
		}()
	}
}

func now() string { return time.Now().Format("2006-01-02 15:04:05") }

func (l *Logger) Log(level string, args ...any) { l.push(LogEntry{Timestamp: now(), Level: level, Args: args}) }
func (l *Logger) LogLocal(level string, args ...any) {
	l.push(LogEntry{Timestamp: now(), Level: level, Args: args, LocalOnly: true})
}
func (l *Logger) Info(args ...any)  { l.Log("info", args...) }
func (l *Logger) Warn(args ...any)  { l.Log("warn", args...) }
func (l *Logger) Error(args ...any) { l.Log("error", args...) }
func (l *Logger) Infof(format string, a ...any) { l.Info(fmt.Sprintf(format, a...)) }
func (l *Logger) Warnf(format string, a ...any) { l.Warn(fmt.Sprintf(format, a...)) }
func (l *Logger) Errorf(format string, a ...any) { l.Error(fmt.Sprintf(format, a...)) }

// ConsoleSink prints "timestamp level message" with ANSI colours when attached to a terminal.
type ConsoleSink struct {
	mu    sync.Mutex
	Color bool
}

func NewConsoleSink() *ConsoleSink {
	fi, _ := os.Stdout.Stat()
	return &ConsoleSink{Color: fi != nil && fi.Mode()&os.ModeCharDevice != 0}
}

func (c *ConsoleSink) Write(e LogEntry) {
	color, reset := "", ""
	if c.Color {
		switch e.Level {
		case "error":
			color = "\x1b[31m"
		case "warn":
			color = "\x1b[33m"
		default:
			color = "\x1b[34m"
		}
		reset = "\x1b[0m"
	}
	level := fmt.Sprintf("%5s", e.Level)
	if len(level) > 5 {
		level = level[len(level)-5:]
	}
	c.mu.Lock()
	fmt.Fprintf(os.Stdout, "%s%s %s%s %s\n", color, e.Timestamp, level, reset, e.Message())
	c.mu.Unlock()
}

// ShipFunc sends a page of [level, timestamp, ...args] entries; false means "persist for retry".
type ShipFunc func(page [][]string) bool

// APISink batches entries (100 per POST) and keeps failed pages in output/yyyy-MM-dd.log (port of APILoggerAdapter).
type APISink struct {
	paths   *Paths
	ship    ShipFunc
	ch      chan LogEntry
	pending atomic.Int64
	done    chan struct{}
	once    sync.Once
}

func NewAPISink(paths *Paths, ship ShipFunc) *APISink {
	s := &APISink{paths: paths, ship: ship, ch: make(chan LogEntry, 10000), done: make(chan struct{})}
	go s.pump()
	return s
}

func (s *APISink) Write(e LogEntry) {
	if e.LocalOnly {
		return
	}
	s.pending.Add(1)
	select {
	case s.ch <- e:
	default:
		s.pending.Add(-1) // drop under extreme backpressure rather than block the agent
	}
}

func (s *APISink) pump() {
	defer close(s.done)
	for first := range s.ch {
		batch := []LogEntry{first}
	collect:
		for len(batch) < 100 {
			select {
			case e, ok := <-s.ch:
				if !ok {
					break collect
				}
				batch = append(batch, e)
			case <-time.After(300 * time.Millisecond):
				break collect
			}
		}
		page := make([][]string, 0, len(batch))
		for _, e := range batch {
			arr := e.ToArray()
			arr[0], arr[1] = arr[1], arr[0]
			page = append(page, arr)
		}
		ok := false
		func() {
			defer func() {
				if r := recover(); r != nil {
					ok = false
				}
			}()
			ok = s.ship(page)
		}()
		if !ok {
			s.writeToFile(batch)
		}
		s.pending.Add(-int64(len(batch)))
	}
}

func (s *APISink) writeToFile(entries []LogEntry) {
	_ = os.MkdirAll(s.paths.OutputDir(), 0o750)
	f, err := os.OpenFile(s.paths.Output(time.Now().Format("2006-01-02")+".log"), os.O_APPEND|os.O_CREATE|os.O_WRONLY, 0o640)
	if err != nil {
		return
	}
	defer f.Close()
	for _, e := range entries {
		b, _ := json.Marshal(e.ToArray())
		f.Write(append(b, '\n'))
	}
}

// Flush waits until queued entries were shipped or persisted.
func (s *APISink) Flush(timeout time.Duration) {
	deadline := time.Now().Add(timeout)
	for s.pending.Load() > 0 && time.Now().Before(deadline) {
		time.Sleep(200 * time.Millisecond)
	}
}

func (s *APISink) Close() {
	s.once.Do(func() { close(s.ch) })
	<-s.done
}

// FileLogWriter appends shipped pages to logs/agent-yyyy-MM-dd.log with 7 days retention.
type FileLogWriter struct {
	paths   *Paths
	enabled atomic.Bool
}

func NewFileLogWriter(paths *Paths) *FileLogWriter { return &FileLogWriter{paths: paths} }

func (w *FileLogWriter) Enable() {
	_ = os.MkdirAll(w.paths.LogsDir(), 0o750)
	w.cleanOld()
	w.enabled.Store(true)
}

func (w *FileLogWriter) cleanOld() {
	entries, err := os.ReadDir(w.paths.LogsDir())
	if err != nil {
		return
	}
	cutoff := time.Now().Add(-7 * 24 * time.Hour)
	for _, e := range entries {
		name := e.Name()
		if !strings.HasPrefix(name, "agent-") || !strings.HasSuffix(name, ".log") {
			continue
		}
		if info, err := e.Info(); err == nil && info.ModTime().Before(cutoff) {
			_ = os.Remove(filepath.Join(w.paths.LogsDir(), name))
		}
	}
}

func (w *FileLogWriter) Write(page [][]string) {
	if !w.enabled.Load() {
		return
	}
	f, err := os.OpenFile(filepath.Join(w.paths.LogsDir(), "agent-"+time.Now().UTC().Format("2006-01-02")+".log"), os.O_APPEND|os.O_CREATE|os.O_WRONLY, 0o640)
	if err != nil {
		return
	}
	defer f.Close()
	for _, entry := range page {
		b, _ := json.Marshal(entry)
		f.Write(append(b, '\n'))
	}
}
