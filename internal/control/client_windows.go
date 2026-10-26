//go:build windows

package control

import (
	"context"
	"net"
	"os"
	"time"

	"github.com/Microsoft/go-winio"
)

func dial(ctx context.Context) (net.Conn, error) {
	timeout := 5 * time.Second
	ctx, cancel := context.WithTimeout(ctx, timeout)
	defer cancel()
	return winio.DialPipeContext(ctx, PipePath)
}

func fileExists(path string) bool {
	_, err := os.Stat(path)
	return err == nil
}
