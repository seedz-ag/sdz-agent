package core

import (
	"math"
	"fmt"
	"net/url"
	"os"
	"strconv"
	"strings"
	"sync"
)

// DiscoveryBody mirrors the /discovery response for one environment.
type DiscoveryBody struct {
	APIURL      string `json:"API_URL"`
	Credentials struct {
		ClientID     string `json:"CLIENT_ID"`
		ClientSecret string `json:"CLIENT_SECRET"`
	} `json:"CREDENTIALS"`
}

type Discovery map[string]*DiscoveryBody

// ValidationError is raised when the required configuration is missing.
type ValidationError struct{ Message string }

func (e *ValidationError) Error() string { return e.Message }

// Env is the layered configuration (port of EnvironmentService): process env <
// CLI overrides < .env file (dotenv override:true) < discovery credentials when ENV is set.
type Env struct {
	mu            sync.RWMutex
	paths         *Paths
	overrides     map[string]string
	values        map[string]string
	discovery     Discovery
	SkipCredCheck bool
}

func NewEnv(paths *Paths, skipCredentialValidation bool) (*Env, error) {
	e := &Env{paths: paths, overrides: map[string]string{}, values: map[string]string{}, SkipCredCheck: skipCredentialValidation}
	return e, e.Parse()
}

// Parse re-reads the .env and validates (zod schema port).
func (e *Env) Parse() error {
	merged := map[string]string{}
	for _, kv := range os.Environ() {
		if i := strings.Index(kv, "="); i > 0 {
			merged[strings.ToUpper(kv[:i])] = kv[i+1:]
		}
	}
	e.mu.RLock()
	for k, v := range e.overrides {
		merged[k] = v
	}
	e.mu.RUnlock()
	for k, v := range ReadDotEnv(e.paths.EnvFile()) {
		merged[strings.ToUpper(k)] = v
	}
	e.mu.Lock()
	e.values = merged
	e.mu.Unlock()
	return e.validate()
}

func (e *Env) validate() error {
	var errs []string
	if !e.SkipCredCheck {
		if u := e.GetOrEmpty("API_URL"); u == "" {
			errs = append(errs, "API_URL: Invalid url")
		} else if p, err := url.Parse(u); err != nil || p.Scheme == "" || p.Host == "" {
			errs = append(errs, "API_URL: Invalid url")
		}
		if e.GetOrEmpty("CLIENT_ID") == "" {
			errs = append(errs, "CLIENT_ID: Required")
		}
		if e.GetOrEmpty("CLIENT_SECRET") == "" {
			errs = append(errs, "CLIENT_SECRET: Required")
		}
	}
	switch strings.ToUpper(e.GetOrEmpty("ENV")) {
	case "", "DEV", "SND", "PRD":
	default:
		errs = append(errs, "ENV: Invalid enum value. Expected 'DEV' | 'SND' | 'PRD'")
	}
	if len(errs) > 0 {
		return &ValidationError{Message: fmt.Sprintf("INVALID CONFIGURATION (%s): %s", e.paths.EnvFile(), strings.Join(errs, "; "))}
	}
	return nil
}

// Merge applies CLI arguments as upper-snake-case overrides (port of mergeEnv).
func (e *Env) Merge(args map[string]string) error {
	e.mu.Lock()
	for k, v := range args {
		if k == "_" || k == "$0" {
			continue
		}
		e.overrides[strings.ToUpper(strings.ReplaceAll(k, "-", "_"))] = v
	}
	e.mu.Unlock()
	return e.Parse()
}

func (e *Env) Set(key, value string) { _ = e.Merge(map[string]string{key: value}) }

func (e *Env) SetDiscovery(d Discovery) {
	e.mu.Lock()
	e.discovery = d
	e.mu.Unlock()
	_ = e.Parse()
}

// Get returns the effective value or "" (discovery overrides API_URL/CLIENT_ID/CLIENT_SECRET when ENV is set).
func (e *Env) GetOrEmpty(key string) string {
	key = strings.ToUpper(key)
	e.mu.RLock()
	defer e.mu.RUnlock()
	if e.discovery != nil {
		if env := strings.ToUpper(e.values["ENV"]); env != "" {
			if body := e.discovery[env]; body != nil {
				switch key {
				case "API_URL":
					return body.APIURL
				case "CLIENT_ID":
					return body.Credentials.ClientID
				case "CLIENT_SECRET":
					return body.Credentials.ClientSecret
				}
			}
		}
	}
	return e.values[key]
}

func (e *Env) Has(key string) bool { return e.GetOrEmpty(key) != "" }

// Int mirrors `Number(value) || fallback`.
func (e *Env) Int(key string, fallback int) int {
	if n, err := strconv.Atoi(strings.TrimSpace(e.GetOrEmpty(key))); err == nil && n != 0 {
		return n
	}
	return fallback
}

func (e *Env) Bool(key string) bool {
	v := strings.ToLower(e.GetOrEmpty(key))
	return v == "true" || v == "1"
}

func normalizeURL(u string) string {
	if u == "" || strings.HasSuffix(u, "/") {
		return u
	}
	return u + "/"
}

func (e *Env) APIURL() string          { return normalizeURL(e.GetOrEmpty("API_URL")) }
func (e *Env) ClientID() string        { return e.GetOrEmpty("CLIENT_ID") }
func (e *Env) ClientSecret() string    { return e.GetOrEmpty("CLIENT_SECRET") }
func (e *Env) APIRequestTimeout() int  { return e.Int("API_REQUEST_TIMEOUT", 300_000) }
func (e *Env) ChunkSize() int          { return e.Int("CHUNK_SIZE", 500) }
func (e *Env) EnvName() string         { return strings.ToUpper(e.GetOrEmpty("ENV")) }
func (e *Env) ExtractLastNDays() int   { return e.Int("EXTRACT_LAST_N_DAYS", 0) }
func (e *Env) Forever() bool           { return e.Bool("FOREVER") }
func (e *Env) Retries() int            { return e.Int("RETRIES", 3) }
func (e *Env) RawOnly() bool           { return e.Bool("RAW_ONLY") }
func (e *Env) Schema() string          { return e.GetOrEmpty("SCHEMA") }
func (e *Env) Throttle() int           { return e.Int("THROTTLE", 0) }
func (e *Env) Type() string            { return e.GetOrEmpty("TYPE") }
func (e *Env) UseConsoleLog() bool     { return e.Bool("USE_CONSOLE_LOG") }
func (e *Env) Listen() bool            { return e.Bool("LISTEN") }

// SessionTTLMinutes is --session-ttl / SESSION_TTL: minutes without an effective command before a
// console `listen` session shuts down. 0 = no limit (every installed agent). Garbage-tolerant on
// purpose: a non-numeric, zero or negative value means "no limit" instead of failing.
func (e *Env) SessionTTLMinutes() float64 {
	v, err := strconv.ParseFloat(strings.TrimSpace(e.GetOrEmpty("SESSION_TTL")), 64)
	if err != nil || v <= 0 || math.IsInf(v, 0) || math.IsNaN(v) {
		return 0
	}
	return v
}
func (e *Env) TelemetryEnabled() bool  { return strings.ToLower(strings.TrimSpace(e.GetOrEmpty("TELEMETRY"))) != "off" }
func (e *Env) AmazonAccessKey() string { return e.GetOrEmpty("AMAZON_ACCESS_KEY") }
func (e *Env) AmazonSecretKey() string { return e.GetOrEmpty("AMAZON_ACCESS_SECRET_KEY") }
func (e *Env) AmazonRegion() string    { return e.GetOrEmpty("AMAZON_REGION") }

// Base credentials ignore the discovery override: logs always go to the base API.
func (e *Env) BaseAPIURL() string {
	e.mu.RLock()
	defer e.mu.RUnlock()
	return normalizeURL(e.values["API_URL"])
}
func (e *Env) BaseClientID() string {
	e.mu.RLock()
	defer e.mu.RUnlock()
	return e.values["CLIENT_ID"]
}
func (e *Env) BaseClientSecret() string {
	e.mu.RLock()
	defer e.mu.RUnlock()
	return e.values["CLIENT_SECRET"]
}
func (e *Env) IsRedirected() bool { return e.BaseClientID() != e.ClientID() }
func (e *Env) Configured() bool {
	return e.GetOrEmpty("API_URL") != "" && e.ClientID() != "" && e.ClientSecret() != ""
}
