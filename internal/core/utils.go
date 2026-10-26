package core

import (
	"fmt"
	"math"
	"math/rand"
	"os"
	"path/filepath"
	"strings"
	"sync"
	"time"
)

// Utils is the port of UtilsService.
type Utils struct {
	env     *Env
	paths   *Paths
	logger  *Logger
	mu      sync.Mutex
	counter map[string]int
}

func NewUtils(env *Env, paths *Paths, logger *Logger) *Utils {
	return &Utils{env: env, paths: paths, logger: logger, counter: map[string]int{}}
}

// Chunk splits data in slices of `size` (CHUNK_SIZE by default); an empty input yields one empty chunk.
func Chunk[T any](data []T, size int) [][]T {
	if size <= 0 {
		size = 1000
	}
	if len(data) == 0 {
		return [][]T{{}}
	}
	var out [][]T
	for i := 0; i < len(data); i += size {
		end := i + size
		if end > len(data) {
			end = len(data)
		}
		out = append(out, data[i:end])
	}
	return out
}

func (u *Utils) Chunk(data []any) [][]any { return Chunk(data, u.env.ChunkSize()) }

func CalculateRetryTime(retry, base int) int {
	t := int64(base)
	for i := 0; i < retry; i++ {
		t *= 2
	}
	if t > math.MaxInt32 {
		return math.MaxInt32
	}
	return int(t)
}

// Wait sleeps between ms and ms+2500 (random throttle), honouring the context.
func (u *Utils) Wait(ms int) { u.WaitCtx(nil, ms) }

func (u *Utils) WaitCtx(done <-chan struct{}, ms int) {
	d := time.Duration(ms+rand.Intn(2501)) * time.Millisecond
	if done == nil {
		time.Sleep(d)
		return
	}
	select {
	case <-time.After(d):
	case <-done:
	}
}

func FormatDuration(ms float64) string {
	minutes := math.Floor(ms / 60000)
	seconds := math.Mod(ms, 60000) / 1000
	return fmt.Sprintf("%.0fms (%.0fmin %.2fs)", ms, minutes, seconds)
}

// WriteJSON writes output/<entity>-NNNN.json per chunk (counter per entity).
func (u *Utils) WriteJSON(entity string, data []any, exception bool) {
	for _, chunk := range u.Chunk(data) {
		u.mu.Lock()
		if !exception {
			u.counter[entity]++
		}
		n := u.counter[entity]
		u.mu.Unlock()
		file := u.paths.Output(fmt.Sprintf("%s-%04d.json", entity, n))
		u.logger.Info("WRITING JSON: ", file)
		_ = os.MkdirAll(u.paths.OutputDir(), 0o750)
		b, err := MarshalJSON(chunk, true)
		if err == nil {
			err = os.WriteFile(file, b, 0o640)
		}
		if err != nil {
			u.logger.Error("WRITING JSON FILE FAILED: ", file, err.Error())
			continue
		}
		u.logger.Info("WRITING JSON FILE DONE: ", file)
	}
}

// CleanOutput deletes output/*.ext.
func (u *Utils) CleanOutput(extensions ...string) {
	for _, ext := range extensions {
		matches, _ := filepath.Glob(filepath.Join(u.paths.OutputDir(), "*."+ext))
		for _, m := range matches {
			_ = os.Remove(m)
		}
	}
}

func UpperFirst(s string) string {
	if s == "" {
		return s
	}
	return strings.ToUpper(s[:1]) + s[1:]
}
