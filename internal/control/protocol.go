// Package control is the local control channel between the service and the tray app / CLI
// (named pipe on Windows, unix socket elsewhere). JSON field names match the .NET agent so
// both tray apps are interchangeable.
package control

import "github.com/seedz-ag/sdz-agent-go/internal/state"

// AgentStatus is the status snapshot shipped to clients.
type AgentStatus = state.Status

type ControlRequest struct {
	// Op: status | configure | clear | run | logs | exportlogs | clearlogs | ping
	Op           string `json:"Op"`
	ClientID     string `json:"ClientId,omitempty"`
	ClientSecret string `json:"ClientSecret,omitempty"`
	APIURL       string `json:"ApiUrl,omitempty"`
	Lines        int    `json:"Lines,omitempty"`
}

type ControlResponse struct {
	Ok      bool          `json:"Ok"`
	Message string        `json:"Message,omitempty"`
	Status  *state.Status `json:"Status,omitempty"`
	Logs    []string      `json:"Logs,omitempty"`
}

func Success(message string) ControlResponse { return ControlResponse{Ok: true, Message: message} }
func Failure(message string) ControlResponse { return ControlResponse{Ok: false, Message: message} }
