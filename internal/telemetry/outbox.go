package telemetry

import (
	"bufio"
	"encoding/json"
	"os"
	"path/filepath"
	"strings"
	"sync"
)

const DefaultMaxLines = 240

// Outbox is the append-only JSONL WAL for telemetry snapshots (port of TelemetryOutboxAdapter).
type Outbox struct {
	mu       sync.Mutex
	path     string
	maxLines int
}

func NewOutboxAt(path string, maxLines int) *Outbox { return &Outbox{path: path, maxLines: maxLines} }

func (o *Outbox) Path() string  { return o.path }
func (o *Outbox) MaxLines() int { return o.maxLines }

func (o *Outbox) Append(entries []any) error {
	if len(entries) == 0 {
		return nil
	}
	o.mu.Lock()
	defer o.mu.Unlock()
	if err := os.MkdirAll(filepath.Dir(o.path), 0o750); err != nil {
		return err
	}
	f, err := os.OpenFile(o.path, os.O_APPEND|os.O_CREATE|os.O_WRONLY, 0o640)
	if err != nil {
		return err
	}
	for _, e := range entries {
		b, err := json.Marshal(e)
		if err != nil {
			f.Close()
			return err
		}
		if _, err := f.Write(append(b, '\n')); err != nil {
			f.Close()
			return err
		}
	}
	f.Close()
	return o.trimLocked()
}

func (o *Outbox) ReadAll() []string {
	o.mu.Lock()
	defer o.mu.Unlock()
	return o.readLocked()
}

func (o *Outbox) readLocked() []string {
	f, err := os.Open(o.path)
	if err != nil {
		return nil
	}
	defer f.Close()
	var lines []string
	sc := bufio.NewScanner(f)
	sc.Buffer(make([]byte, 1024*1024), 8*1024*1024)
	for sc.Scan() {
		if l := strings.TrimSpace(sc.Text()); l != "" {
			lines = append(lines, l)
		}
	}
	return lines
}

func (o *Outbox) RemoveFirst(count int) error {
	if count <= 0 {
		return nil
	}
	o.mu.Lock()
	defer o.mu.Unlock()
	lines := o.readLocked()
	if count > len(lines) {
		count = len(lines)
	}
	return o.writeLocked(lines[count:])
}

func (o *Outbox) trimLocked() error {
	lines := o.readLocked()
	if len(lines) > o.maxLines {
		return o.writeLocked(lines[len(lines)-o.maxLines:])
	}
	return nil
}

func (o *Outbox) writeLocked(lines []string) error {
	if err := os.MkdirAll(filepath.Dir(o.path), 0o750); err != nil {
		return err
	}
	content := ""
	if len(lines) > 0 {
		content = strings.Join(lines, "\n") + "\n"
	}
	return os.WriteFile(o.path, []byte(content), 0o640)
}
