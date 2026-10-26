//go:build !windows

package hosting

import (
	"net"
	"os"
)

// NotifyReady sends READY=1 to systemd when NOTIFY_SOCKET is set (Type=notify units).
func NotifyReady() {
	sock := os.Getenv("NOTIFY_SOCKET")
	if sock == "" {
		return
	}
	conn, err := net.DialUnix("unixgram", nil, &net.UnixAddr{Name: sock, Net: "unixgram"})
	if err != nil {
		return
	}
	defer conn.Close()
	_, _ = conn.Write([]byte("READY=1"))
}
