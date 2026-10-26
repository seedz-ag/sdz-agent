package hosting

import (
	"context"
	"os"
	"runtime"
	"sync"
	"time"

	"github.com/kardianos/service"
	"github.com/seedz-ag/sdz-agent-go/internal/core"
)

// RunUnderServiceManager runs fn as the service body. On Windows, when started by the Service
// Control Manager, it goes through the SCM dispatcher (kardianos/service): without that handshake
// the SCM kills the process after ~30 s with error 1053 and the control pipe never appears.
// Elsewhere (systemd, launchd, a console) fn runs directly with ctx.
func RunUnderServiceManager(ctx context.Context, paths *core.Paths, fn func(context.Context) error) error {
	if runtime.GOOS != "windows" || service.Interactive() {
		return fn(ctx)
	}
	p := &scmProgram{parent: ctx, fn: fn, done: make(chan struct{})}
	svc, err := service.New(p, config(paths))
	if err != nil {
		return fn(ctx)
	}
	if err := svc.Run(); err != nil {
		return err
	}
	return p.err
}

type scmProgram struct {
	parent context.Context
	fn     func(context.Context) error
	cancel context.CancelFunc
	done   chan struct{}
	err    error

	mu       sync.Mutex
	stopping bool
}

// Start must return quickly: the body runs in the background.
func (p *scmProgram) Start(s service.Service) error {
	ctx, cancel := context.WithCancel(p.parent)
	p.cancel = cancel
	go func() {
		p.err = p.fn(ctx)
		close(p.done)
		p.mu.Lock()
		stopping := p.stopping
		p.mu.Unlock()
		if !stopping {
			// the body ended on its own (e.g. update rollback): exit non-zero so the SCM recovery policy restarts us
			os.Exit(1)
		}
	}()
	return nil
}

// Stop cancels the body and waits for a graceful shutdown (logs flushed, extraction interrupted).
func (p *scmProgram) Stop(s service.Service) error {
	p.mu.Lock()
	p.stopping = true
	p.mu.Unlock()
	if p.cancel != nil {
		p.cancel()
	}
	select {
	case <-p.done:
	case <-time.After(60 * time.Second):
	}
	return nil
}
