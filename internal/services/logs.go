package services

import (
	"bufio"
	"context"
	"encoding/json"
	"os"
	"path/filepath"

	"github.com/seedz-ag/sdz-agent-go/internal/api"
	"github.com/seedz-ag/sdz-agent-go/internal/core"
)

// Logs re-ships output/*.log entries that failed to reach the API (port of LogsService.consumeOutput).
type Logs struct {
	api    *api.Service
	paths  *core.Paths
	logger *core.Logger
}

func NewLogs(a *api.Service, paths *core.Paths, logger *core.Logger) *Logs {
	return &Logs{api: a, paths: paths, logger: logger}
}

func (l *Logs) ConsumeOutput(ctx context.Context) error {
	files, _ := filepath.Glob(filepath.Join(l.paths.OutputDir(), "*.log"))
	for _, file := range files {
		if ctx.Err() != nil {
			return ctx.Err()
		}
		failed := false
		var batch [][]string
		f, err := os.Open(file)
		if err != nil {
			continue
		}
		sc := bufio.NewScanner(f)
		sc.Buffer(make([]byte, 1024*1024), 4*1024*1024)
		for sc.Scan() {
			var item []string
			if err := json.Unmarshal(sc.Bytes(), &item); err != nil || len(item) < 2 {
				continue
			}
			msg := ""
			if len(item) > 2 {
				msg = item[2]
			}
			batch = append(batch, []string{item[1], item[0], msg})
			if len(batch) == 100 {
				if !l.api.SendLog(ctx, batch) {
					failed = true
				}
				batch = nil
			}
		}
		f.Close()
		if len(batch) > 0 && !l.api.SendLog(ctx, batch) {
			failed = true
		}
		if failed {
			l.logger.Errorf("FAILED TO SEND LOGS FROM %s, FILE KEPT FOR RETRY", file)
		} else {
			_ = os.Remove(file)
		}
	}
	return nil
}
