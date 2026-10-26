//go:build windows

package control

import (
	"net"

	"github.com/Microsoft/go-winio"
)

// SYSTEM and Administrators full control, Authenticated Users read/write.
const pipeSecurity = "D:P(A;;GA;;;SY)(A;;GA;;;BA)(A;;GRGW;;;AU)"

func (s *Server) listen() (net.Listener, string, error) {
	l, err := winio.ListenPipe(PipePath, &winio.PipeConfig{SecurityDescriptor: pipeSecurity, MessageMode: false})
	return l, PipePath, err
}

func (s *Server) cleanup(string) {}
