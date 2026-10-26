//go:build !windows

package control

import (
	"context"
	"net"
	"os"
)

func dial(ctx context.Context) (net.Conn, error) { return dialUnixCandidates(ctx) }

func fileExists(path string) bool {
	_, err := os.Stat(path)
	return err == nil
}
