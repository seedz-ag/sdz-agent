package update

import (
	"context"
	"fmt"
	"path/filepath"
	"strings"
	"sync"
	"time"

	"github.com/seedz-ag/sdz-agent-go/internal/core"
)

// Options drive an on-demand update (remote "Update" command or CLI).
type Options struct {
	// ManifestURL replaces the configured manifest; only honoured when signatures are verified (public key set).
	ManifestURL string `json:"manifestUrl,omitempty"`
	// Version pins the expected version: the update is refused when the manifest offers another one.
	Version string `json:"version,omitempty"`
	// Force installs even when the manifest version is not newer (reinstall / downgrade) and even during an extraction.
	Force bool `json:"force,omitempty"`
	// CheckOnly reports what would happen without downloading anything.
	CheckOnly bool `json:"check,omitempty"`
}

// Result is what the agent answers to the sender of a remote "Update".
type Result struct {
	Status  string `json:"status"` // up-to-date | available | updating | rejected | error
	Current string `json:"current"`
	Target  string `json:"target,omitempty"`
	Message string `json:"message,omitempty"`
}

// ParseOptions reads the "arguments" of a remote Update command:
// [] | ["check"] | ["force"] | ["3.1.0"] | [{"version":"3.1.0","force":true,"check":false,"manifestUrl":"..."}].
func ParseOptions(args []any) Options {
	var o Options
	for _, a := range args {
		switch v := a.(type) {
		case string:
			switch s := strings.TrimSpace(v); strings.ToLower(s) {
			case "", "update", "apply":
			case "check":
				o.CheckOnly = true
			case "force":
				o.Force = true
			default:
				o.Version = s
			}
		case map[string]any:
			if s, ok := v["version"].(string); ok {
				o.Version = strings.TrimSpace(s)
			}
			if s, ok := v["manifestUrl"].(string); ok {
				o.ManifestURL = strings.TrimSpace(s)
			}
			o.Force = o.Force || truthy(v["force"])
			o.CheckOnly = o.CheckOnly || truthy(v["check"])
		}
	}
	return o
}

func truthy(v any) bool {
	switch t := v.(type) {
	case bool:
		return t
	case string:
		return strings.EqualFold(t, "true") || t == "1"
	case float64:
		return t != 0
	}
	return false
}

var updating sync.Mutex

// Prepare resolves the manifest, decides and (unless CheckOnly) downloads and verifies the package.
// It returns the answer for the caller and, when an install is due, the function that launches the
// installer: the caller answers first, then launches (the installer stops this service).
func (s *Service) Prepare(ctx context.Context, o Options) (Result, func() error) {
	res := Result{Current: core.Version}
	if !updating.TryLock() {
		res.Status, res.Message = "rejected", "an update is already in progress"
		return res, nil
	}
	launchReady := false
	defer func() {
		if !launchReady {
			updating.Unlock()
		}
	}()

	manifestURL := s.ManifestURL()
	if o.ManifestURL != "" && o.ManifestURL != manifestURL {
		if s.publicKey() == "" {
			res.Status, res.Message = "rejected", "manifestUrl override requires signed manifests (SDZ_AGENT_UPDATE_PUBKEY)"
			return res, nil
		}
		manifestURL = o.ManifestURL
	}
	m, err := s.FetchManifestFrom(ctx, manifestURL)
	if err != nil {
		res.Status, res.Message = "error", fmt.Sprintf("manifest %s: %v", manifestURL, err)
		return res, nil
	}
	res.Target = m.Version
	if o.Version != "" && normalize(o.Version) != normalize(m.Version) {
		res.Status, res.Message = "rejected", fmt.Sprintf("manifest offers %s, %s was requested", m.Version, o.Version)
		return res, nil
	}
	if !IsNewer(m.Version, core.Version) && !o.Force {
		res.Status, res.Message = "up-to-date", "no newer version in the manifest"
		return res, nil
	}
	key := PackageKey()
	pkg, ok := m.Packages[key]
	if !ok {
		res.Status, res.Message = "error", "no package for "+key
		return res, nil
	}
	if o.CheckOnly {
		res.Status, res.Message = "available", "package "+key
		return res, nil
	}
	file, err := s.download(ctx, pkg, m.Version, key)
	if err != nil {
		res.Status, res.Message = "error", "download: "+err.Error()
		return res, nil
	}
	st := s.loadState()
	previous := ""
	if st != nil && st.TargetVersion == core.Version {
		previous = s.currentPackagePath(key, filepath.Ext(file))
	}
	s.saveState(State{PreviousPackage: previous, PreviousVersion: core.Version, TargetVersion: m.Version,
		InstalledAt: time.Now().UTC().Format(time.RFC3339), Healthy: false, StartFailures: 0})
	s.keepCurrentPackage(file, key)
	res.Status, res.Message = "updating", "package verified, installer starting; the service restarts with the new version"
	launchReady = true
	return res, func() error {
		defer updating.Unlock()
		s.logger.Infof("LAUNCHING INSTALLER %s", file)
		return s.Launch(file)
	}
}

func normalize(v string) string {
	parts := normalizeVersion(v)
	out := make([]string, len(parts))
	for i, p := range parts {
		out[i] = fmt.Sprint(p)
	}
	return strings.Join(out, ".")
}
