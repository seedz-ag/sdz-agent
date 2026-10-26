// Package update implements self-update: signed manifest, sha256-verified package, native installer hand-off, rollback.
package update

import (
	"context"
	"crypto/ecdsa"
	"crypto/sha256"
	"crypto/x509"
	"encoding/base64"
	"encoding/hex"
	"encoding/json"
	"encoding/pem"
	"errors"
	"fmt"
	"io"
	"net/http"
	"net/url"
	"os"
	"os/exec"
	"path/filepath"
	"runtime"
	"strconv"
	"strings"
	"time"

	"github.com/seedz-ag/sdz-agent-go/internal/core"
)

const (
	ManifestURLVariable = "SDZ_AGENT_UPDATE_URL"
	PublicKeyVariable   = "SDZ_AGENT_UPDATE_PUBKEY"
	AutoUpdateVariable  = "SDZ_AGENT_AUTO_UPDATE"
	DefaultManifestURL  = "https://github.com/seedz-ag/sdz-agent-go/releases/latest/download/manifest.json"
	// EmbeddedPublicKey (PEM) verifies manifests; empty = verification disabled (sha256 only).
	EmbeddedPublicKey = ""
)

type Package struct {
	URL    string `json:"url"`
	SHA256 string `json:"sha256"`
}

type Manifest struct {
	Version     string             `json:"version"`
	Channel     string             `json:"channel"`
	PublishedAt string             `json:"publishedAt"`
	Packages    map[string]Package `json:"packages"`
	Signature   string             `json:"signature,omitempty"`
}

type State struct {
	PreviousPackage string `json:"PreviousPackage,omitempty"`
	PreviousVersion string `json:"PreviousVersion,omitempty"`
	TargetVersion   string `json:"TargetVersion,omitempty"`
	InstalledAt     string `json:"InstalledAt,omitempty"`
	Healthy         bool   `json:"Healthy"`
	StartFailures   int    `json:"StartFailures"`
}

type Service struct {
	env    *core.Env
	paths  *core.Paths
	logger *core.Logger
	http   *http.Client
	// Launch is substitutable in tests.
	Launch func(file string) error
}

func New(env *core.Env, paths *core.Paths, logger *core.Logger) *Service {
	s := &Service{env: env, paths: paths, logger: logger, http: &http.Client{Timeout: 10 * time.Minute}}
	s.Launch = s.launchInstaller
	return s
}

func (s *Service) ManifestURL() string {
	if v := s.env.GetOrEmpty(ManifestURLVariable); v != "" {
		return v
	}
	return DefaultManifestURL
}

func (s *Service) AutoUpdateEnabled() bool {
	return !strings.EqualFold(s.env.GetOrEmpty(AutoUpdateVariable), "false")
}

func (s *Service) statePath() string { return filepath.Join(s.paths.UpdatesDir(), "state.json") }

// PackageKey identifies this platform's package in the manifest.
func PackageKey() string {
	arch := "x64"
	if runtime.GOARCH == "arm64" {
		arch = "arm64"
	}
	switch runtime.GOOS {
	case "windows":
		return "win-" + arch
	case "darwin":
		return "osx-" + arch
	default:
		format := "rpm"
		for _, p := range []string{"/usr/bin/dpkg", "/bin/dpkg"} {
			if _, err := os.Stat(p); err == nil {
				format = "deb"
				break
			}
		}
		return "linux-" + arch + "-" + format
	}
}

func normalizeVersion(v string) []int {
	v = strings.TrimLeft(strings.TrimSpace(v), "vV")
	if i := strings.IndexAny(v, "-+"); i > 0 {
		v = v[:i]
	}
	var out []int
	for _, part := range strings.Split(v, ".") {
		n, err := strconv.Atoi(part)
		if err != nil {
			return nil
		}
		out = append(out, n)
	}
	return out
}

// IsNewer compares semver-ish strings ignoring the v prefix and pre-release suffixes.
func IsNewer(candidate, current string) bool {
	c, cur := normalizeVersion(candidate), normalizeVersion(current)
	if c == nil || cur == nil {
		return false
	}
	for i := 0; i < len(c) || i < len(cur); i++ {
		a, b := 0, 0
		if i < len(c) {
			a = c[i]
		}
		if i < len(cur) {
			b = cur[i]
		}
		if a != b {
			return a > b
		}
	}
	return false
}

func (s *Service) FetchManifest(ctx context.Context) (*Manifest, error) {
	return s.FetchManifestFrom(ctx, s.ManifestURL())
}

// FetchManifestFrom downloads and verifies a manifest from an explicit URL.
func (s *Service) FetchManifestFrom(ctx context.Context, manifestURL string) (*Manifest, error) {
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, manifestURL, nil)
	if err != nil {
		return nil, err
	}
	req.Header.Set("User-Agent", "sdz-agent/"+core.Version)
	resp, err := s.http.Do(req)
	if err != nil {
		return nil, err
	}
	defer resp.Body.Close()
	if resp.StatusCode != 200 {
		return nil, fmt.Errorf("manifest request failed with status %d", resp.StatusCode)
	}
	raw, err := io.ReadAll(io.LimitReader(resp.Body, 1<<20))
	if err != nil {
		return nil, err
	}
	return ParseManifest(raw, s.publicKey())
}

func (s *Service) publicKey() string {
	if v := s.env.GetOrEmpty(PublicKeyVariable); v != "" {
		return v
	}
	return EmbeddedPublicKey
}

// ParseManifest decodes the manifest and, when a public key is given, verifies the ECDSA-P256/SHA256
// signature over the exact bytes of the "packages" value.
func ParseManifest(raw []byte, publicKeyPEM string) (*Manifest, error) {
	var m Manifest
	if err := json.Unmarshal(raw, &m); err != nil {
		return nil, err
	}
	if strings.TrimSpace(publicKeyPEM) == "" {
		return &m, nil
	}
	if strings.TrimSpace(m.Signature) == "" {
		return nil, errors.New("UPDATE MANIFEST IS NOT SIGNED")
	}
	var top map[string]json.RawMessage
	if err := json.Unmarshal(raw, &top); err != nil {
		return nil, err
	}
	packages, ok := top["packages"]
	if !ok {
		return nil, errors.New("UPDATE MANIFEST HAS NO PACKAGES")
	}
	block, _ := pem.Decode([]byte(publicKeyPEM))
	if block == nil {
		return nil, errors.New("INVALID UPDATE PUBLIC KEY")
	}
	pub, err := x509.ParsePKIXPublicKey(block.Bytes)
	if err != nil {
		return nil, fmt.Errorf("INVALID UPDATE PUBLIC KEY: %w", err)
	}
	ecPub, ok := pub.(*ecdsa.PublicKey)
	if !ok {
		return nil, errors.New("UPDATE PUBLIC KEY IS NOT ECDSA")
	}
	sig, err := base64.StdEncoding.DecodeString(m.Signature)
	if err != nil {
		return nil, errors.New("UPDATE MANIFEST SIGNATURE IS INVALID")
	}
	digest := sha256.Sum256([]byte(packages))
	if !ecdsa.VerifyASN1(ecPub, digest[:], sig) {
		return nil, errors.New("UPDATE MANIFEST SIGNATURE IS INVALID")
	}
	return &m, nil
}

// CheckAndApply returns the new version when one is available (and launched when apply=true), "" when up to date.
func (s *Service) CheckAndApply(ctx context.Context, apply bool) (string, error) {
	m, err := s.FetchManifest(ctx)
	if err != nil {
		return "", err
	}
	if !IsNewer(m.Version, core.Version) {
		s.logger.Infof("AGENT IS UP TO DATE (%s)", core.Version)
		return "", nil
	}
	key := PackageKey()
	pkg, ok := m.Packages[key]
	if !ok {
		s.logger.Warnf("NO PACKAGE FOR %s IN VERSION %s", key, m.Version)
		return "", nil
	}
	s.logger.Infof("UPDATE AVAILABLE: %s -> %s (%s)", core.Version, m.Version, key)
	if !apply {
		return m.Version, nil
	}
	file, err := s.download(ctx, pkg, m.Version, key)
	if err != nil {
		return "", err
	}
	st := s.loadState()
	previous := ""
	if st != nil && st.TargetVersion == core.Version {
		previous = s.currentPackagePath(key, filepath.Ext(file))
	}
	s.saveState(State{PreviousPackage: previous, PreviousVersion: core.Version, TargetVersion: m.Version,
		InstalledAt: time.Now().UTC().Format(time.RFC3339), Healthy: false, StartFailures: 0})
	s.keepCurrentPackage(file, key)
	if err := s.Launch(file); err != nil {
		return "", err
	}
	return m.Version, nil
}

func (s *Service) download(ctx context.Context, pkg Package, version, key string) (string, error) {
	if err := os.MkdirAll(s.paths.UpdatesDir(), 0o750); err != nil {
		return "", err
	}
	u, err := url.Parse(pkg.URL)
	if err != nil {
		return "", err
	}
	file := filepath.Join(s.paths.UpdatesDir(), fmt.Sprintf("sdz-agent-%s-%s%s", version, key, filepath.Ext(u.Path)))
	s.logger.Infof("DOWNLOADING %s", pkg.URL)
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, pkg.URL, nil)
	if err != nil {
		return "", err
	}
	resp, err := s.http.Do(req)
	if err != nil {
		return "", err
	}
	defer resp.Body.Close()
	if resp.StatusCode != 200 {
		return "", fmt.Errorf("download failed with status %d", resp.StatusCode)
	}
	out, err := os.Create(file)
	if err != nil {
		return "", err
	}
	h := sha256.New()
	if _, err := io.Copy(io.MultiWriter(out, h), resp.Body); err != nil {
		out.Close()
		return "", err
	}
	out.Close()
	got := hex.EncodeToString(h.Sum(nil))
	if !strings.EqualFold(got, strings.TrimSpace(pkg.SHA256)) {
		_ = os.Remove(file)
		return "", fmt.Errorf("SHA256 MISMATCH FOR %s: expected %s, got %s", file, pkg.SHA256, got)
	}
	s.logger.Infof("PACKAGE VERIFIED %s", file)
	return file, nil
}

func (s *Service) currentPackagePath(key, ext string) string {
	return filepath.Join(s.paths.UpdatesDir(), "current-"+key+ext)
}

func (s *Service) keepCurrentPackage(newFile, key string) {
	ext := filepath.Ext(newFile)
	current := s.currentPackagePath(key, ext)
	if _, err := os.Stat(current); err == nil {
		previous := filepath.Join(s.paths.UpdatesDir(), "previous-"+key+ext)
		if err := copyFile(current, previous); err == nil {
			if st := s.loadState(); st != nil {
				st.PreviousPackage = previous
				s.saveState(*st)
			}
		}
	}
	if err := copyFile(newFile, current); err != nil {
		s.logger.Warn("COULD NOT KEEP PACKAGE FOR ROLLBACK", err.Error())
	}
}

func copyFile(src, dst string) error {
	in, err := os.Open(src)
	if err != nil {
		return err
	}
	defer in.Close()
	out, err := os.Create(dst)
	if err != nil {
		return err
	}
	defer out.Close()
	_, err = io.Copy(out, in)
	return err
}

// MarkHealthy is called once the running version authenticated successfully.
func (s *Service) MarkHealthy() {
	st := s.loadState()
	if st == nil || st.TargetVersion != core.Version || st.Healthy {
		return
	}
	st.Healthy = true
	st.StartFailures = 0
	s.saveState(*st)
	s.logger.Infof("UPDATE TO %s CONFIRMED HEALTHY", core.Version)
}

// RegisterStartFailure counts a failed start; after 3 the previous package is reinstalled (returns true).
func (s *Service) RegisterStartFailure() bool {
	st := s.loadState()
	if st == nil || st.Healthy || st.TargetVersion != core.Version {
		return false
	}
	st.StartFailures++
	s.saveState(*st)
	if st.StartFailures < 3 || st.PreviousPackage == "" {
		return false
	}
	if _, err := os.Stat(st.PreviousPackage); err != nil {
		return false
	}
	s.logger.Errorf("VERSION %s FAILED TO START %d TIMES, ROLLING BACK TO %s", core.Version, st.StartFailures, st.PreviousVersion)
	st.TargetVersion = st.PreviousVersion
	st.Healthy = true
	s.saveState(*st)
	_ = s.Launch(st.PreviousPackage)
	return true
}

func (s *Service) launchInstaller(file string) error {
	log := filepath.Join(s.paths.UpdatesDir(), "install.log")
	var cmd *exec.Cmd
	switch runtime.GOOS {
	case "windows":
		if strings.HasSuffix(strings.ToLower(file), ".exe") {
			// NSIS setup: silent, into the current install folder (where .env, output\ and logs\ live)
			cmd = nsisSilentCommand(file, s.paths.AppDir)
		} else {
			cmd = exec.Command("msiexec.exe", "/i", file, "/qn", "/norestart", "/l*v", log)
		}
	case "darwin":
		cmd = exec.Command("/bin/sh", "-c", fmt.Sprintf("sleep 2; /usr/sbin/installer -pkg '%s' -target / > '%s' 2>&1", file, log))
	default:
		install := fmt.Sprintf("(apt-get install -y '%s' || dpkg -i '%s')", file, file)
		if !strings.HasSuffix(strings.ToLower(file), ".deb") {
			install = fmt.Sprintf("(dnf install -y '%s' || yum install -y '%s' || rpm -Uvh '%s')", file, file, file)
		}
		script := fmt.Sprintf("sleep 2; %s > '%s' 2>&1", install, log)
		if _, err := os.Stat("/usr/bin/systemd-run"); err == nil {
			cmd = exec.Command("/usr/bin/systemd-run", "--unit=sdz-agent-update-"+time.Now().Format("150405"), "--collect", "/bin/sh", "-c", script)
		} else {
			cmd = exec.Command("setsid", "/bin/sh", "-c", "nohup sh -c \""+strings.ReplaceAll(script, `"`, `\"`)+"\" >/dev/null 2>&1 &")
		}
	}
	s.logger.Infof("LAUNCHING INSTALLER: %s", strings.Join(cmd.Args, " "))
	return cmd.Start()
}

func (s *Service) loadState() *State {
	raw, err := os.ReadFile(s.statePath())
	if err != nil {
		return nil
	}
	var st State
	if json.Unmarshal(raw, &st) != nil {
		return nil
	}
	return &st
}

func (s *Service) saveState(st State) {
	_ = os.MkdirAll(s.paths.UpdatesDir(), 0o750)
	b, _ := json.MarshalIndent(st, "", "  ")
	_ = os.WriteFile(s.statePath(), b, 0o640)
}
