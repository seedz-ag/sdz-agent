package commands

import (
	"bufio"
	"context"
	"errors"
	"fmt"
	"os"
	"strings"
	"time"

	"github.com/seedz-ag/sdz-agent-go/internal/control"
	"github.com/seedz-ag/sdz-agent-go/internal/core"
	"github.com/seedz-ag/sdz-agent-go/internal/state"
	"golang.org/x/term"
)

// Environment variables accepted by `credentials set` (keep secrets out of `ps` and the shell history).
const (
	ClientIDVariable     = "SDZ_CLIENT_ID"
	ClientSecretVariable = "SDZ_CLIENT_SECRET"
	APIURLVariable       = "SDZ_API_URL"
	CredentialsUsage     = "usage: sdz-agent credentials <set|show|test|clear> [--client-id ID] [--client-secret SECRET | --client-secret-stdin] [--api-url URL] [--non-interactive] [--reveal] [--yes]"
)

type CredentialsOptions struct {
	ClientID, ClientSecret, APIURL string
	// SecretFromStdin reads the secret from the first line of stdin.
	SecretFromStdin bool
	NonInteractive  bool
	// Reveal prints the full secret on `show`.
	Reveal bool
	// Yes skips the confirmation prompts (`clear --yes`, `set --overwrite`).
	Yes bool
}

// Credentials is `sdz-agent credentials set|show|test|clear`: terminal management of the credentials.
// It talks to the running service through the control channel (same path as the tray, so the scheduler
// reloads at once and members of the sdz-agent group need no root); without a service it edits the .env.
type Credentials struct {
	config *Configure
	paths  *core.Paths
	client func() *control.Client
}

func NewCredentials(config *Configure, paths *core.Paths) *Credentials {
	return &Credentials{config: config, paths: paths, client: func() *control.Client { return &control.Client{Timeout: 45 * time.Second} }}
}

// Mask renders a secret as `1025…1quh`: recognisable, not usable.
func Mask(secret string) string {
	if secret == "" {
		return "-"
	}
	r := []rune(secret)
	if len(r) <= 8 {
		return strings.Repeat("•", len(r))
	}
	return string(r[:4]) + "…" + string(r[len(r)-4:])
}

// ResolveCredentials picks the inputs: CLI option, then stdin (secret only), then SDZ_* environment variables.
func ResolveCredentials(o CredentialsOptions, getenv func(string) string, readStdin func() string) (clientID, clientSecret, apiURL string) {
	clientID = firstNonEmpty(o.ClientID, getenv(ClientIDVariable))
	clientSecret = strings.TrimSpace(o.ClientSecret)
	if clientSecret == "" && o.SecretFromStdin {
		clientSecret = strings.TrimSpace(readStdin())
	}
	if clientSecret == "" {
		clientSecret = strings.TrimSpace(getenv(ClientSecretVariable))
	}
	apiURL = firstNonEmpty(o.APIURL, getenv(APIURLVariable))
	return
}

func firstNonEmpty(values ...string) string {
	for _, v := range values {
		if s := strings.TrimSpace(v); s != "" {
			return s
		}
	}
	return ""
}

func readStdinLine() string {
	line, _ := bufio.NewReader(os.Stdin).ReadString('\n')
	return line
}

func stdinIsTerminal() bool { return term.IsTerminal(int(os.Stdin.Fd())) }

// RunCLI dispatches the action and returns the exit code.
func (c *Credentials) RunCLI(ctx context.Context, action string, o CredentialsOptions) int {
	switch strings.ToLower(strings.TrimSpace(action)) {
	case "", "show":
		return c.show(ctx, o)
	case "set":
		return c.set(ctx, o)
	case "test":
		return c.test(ctx)
	case "clear":
		return c.clear(ctx, o)
	default:
		fmt.Fprintf(os.Stderr, "✖ unknown credentials action '%s'\n%s\n", action, CredentialsUsage)
		return 1
	}
}

// ---------------------------------------------------------------- set

func (c *Credentials) set(ctx context.Context, o CredentialsOptions) int {
	clientID, clientSecret, apiURL := ResolveCredentials(o, os.Getenv, readStdinLine)
	local := core.ReadDotEnv(c.paths.EnvFile())
	if apiURL == "" {
		apiURL = local["API_URL"]
	}
	apiURL, err := NormalizeAPIURL(apiURL)
	if err != nil {
		fmt.Fprintln(os.Stderr, "✖ INVALID API URL")
		return 2
	}

	interactive := !o.NonInteractive && stdinIsTerminal()
	if current := local["CLIENT_ID"]; current != "" && !o.Yes && interactive && clientID == "" {
		if !confirm(fmt.Sprintf("YOUR AGENT IS CONFIGURED (client %s), OVERWRITE? [y/N] ", current)) {
			fmt.Println("✖ CANCELLED.")
			return 1
		}
	}

	for {
		if clientID == "" || clientSecret == "" {
			if !interactive {
				fmt.Fprintf(os.Stderr, "✖ CLIENT ID AND CLIENT SECRET ARE REQUIRED (--client-id / --client-secret, --client-secret-stdin or %s / %s).\n", ClientIDVariable, ClientSecretVariable)
				return 2
			}
			clientID = prompt("WHAT'S YOUR CLIENT ID? ")
			clientSecret = promptSecret("WHAT'S YOUR CLIENT SECRET? ")
			if clientID == "" || clientSecret == "" {
				continue
			}
		}

		// preferred path: the running service validates, saves and reloads its schedules
		if resp, err := c.client().Configure(ctx, clientID, clientSecret, apiURL); err == nil {
			if resp.Ok {
				fmt.Printf("✔ CREDENTIALS SAVED AND APPLIED (client %s, %s)\n", clientID, apiURL)
				fmt.Println("  the service reloaded the setting and its schedules; check with `sdz-agent status`.")
				return 0
			}
			fmt.Println("✖", resp.Message)
			if !interactive {
				return 3
			}
			clientID, clientSecret = "", ""
			continue
		}

		// service not reachable: validate against the API and write the .env ourselves
		if !c.config.Validate(ctx, apiURL, clientID, clientSecret) {
			fmt.Println("✖ INVALID CREDENTIALS")
			if !interactive {
				return 3
			}
			clientID, clientSecret = "", ""
			continue
		}
		if err := c.paths.EnsureDirectories(); err == nil {
			err = core.WriteDotEnv(c.paths.EnvFile(), [][2]string{{"API_URL", apiURL}, {"CLIENT_ID", clientID}, {"CLIENT_SECRET", clientSecret}})
		}
		if err != nil {
			if errors.Is(err, os.ErrPermission) {
				fmt.Fprintf(os.Stderr, "✖ NO PERMISSION TO WRITE %s (run as root/administrator, or start the service and retry)\n", c.paths.EnvFile())
				return 4
			}
			fmt.Fprintln(os.Stderr, "✖", err)
			return 1
		}
		fmt.Printf("✔ CREDENTIALS SAVED. (%s)\n", c.paths.EnvFile())
		fmt.Println("  the service is not running; it will load them on its next start (`sdz-agent service restart`).")
		return 0
	}
}

// ---------------------------------------------------------------- show

func (c *Credentials) show(ctx context.Context, o CredentialsOptions) int {
	var live *state.Status
	if resp, err := c.client().Status(ctx); err == nil {
		live = resp.Status
	}
	local := core.ReadDotEnv(c.paths.EnvFile())
	clientID, secret, apiURL := local["CLIENT_ID"], local["CLIENT_SECRET"], local["API_URL"]
	if live != nil {
		clientID, secret, apiURL = live.ClientID, live.ClientSecret, live.APIURL
	}
	_, statErr := os.Stat(c.paths.EnvFile())
	missing := ""
	if statErr != nil {
		missing = " (missing)"
	}

	fmt.Println("SDZ Agent credentials")
	fmt.Printf("  source:     %s\n", map[bool]string{true: "running service", false: "local file"}[live != nil])
	fmt.Printf("  file:       %s%s\n", c.paths.EnvFile(), missing)
	if clientID == "" || secret == "" {
		fmt.Println("  configured: no")
		fmt.Println("  run `sdz-agent credentials set` to configure.")
		return 1
	}
	fmt.Println("  configured: yes")
	fmt.Printf("  client id:  %s\n", clientID)
	if o.Reveal {
		fmt.Printf("  secret:     %s\n", secret)
	} else {
		fmt.Printf("  secret:     %s  (--reveal to show)\n", Mask(secret))
	}
	fmt.Printf("  api url:    %s\n", apiURL)
	if live != nil {
		fmt.Printf("  auth:       %s\n", map[bool]string{true: "ok", false: "failed / not checked"}[live.AuthOK])
		sched := "-"
		if len(live.Schedules) > 0 {
			sched = strings.Join(live.Schedules, " | ")
		}
		fmt.Printf("  schedules:  %s\n", sched)
		next := "-"
		if live.NextRunAt != nil {
			next = live.NextRunAt.Local().Format("2006-01-02 15:04:05")
		}
		fmt.Printf("  next run:   %s\n", next)
	} else {
		fmt.Println("  service:    not reachable (not running, or this user is not in the sdz-agent group)")
	}
	return 0
}

// ---------------------------------------------------------------- test

func (c *Credentials) test(ctx context.Context) int {
	local := core.ReadDotEnv(c.paths.EnvFile())
	clientID, secret, apiURL := local["CLIENT_ID"], local["CLIENT_SECRET"], local["API_URL"]
	if clientID == "" || secret == "" {
		if resp, err := c.client().Status(ctx); err == nil && resp.Status != nil {
			clientID, secret, apiURL = resp.Status.ClientID, resp.Status.ClientSecret, resp.Status.APIURL
		}
	}
	if clientID == "" || secret == "" {
		fmt.Println("✖ NOT CONFIGURED")
		return 2
	}
	u, err := NormalizeAPIURL(apiURL)
	if err != nil {
		fmt.Fprintln(os.Stderr, "✖ INVALID API URL")
		return 2
	}
	ok := c.config.Validate(ctx, u, clientID, secret)
	fmt.Printf("          AUTH: %s  (client %s, %s)\n", map[bool]string{true: "SUCCESS", false: "FAIL"}[ok], clientID, u)
	if ok {
		return 0
	}
	return 1
}

// ---------------------------------------------------------------- clear

func (c *Credentials) clear(ctx context.Context, o CredentialsOptions) int {
	if !o.Yes && !o.NonInteractive && stdinIsTerminal() {
		if !confirm("REMOVE THE SAVED CREDENTIALS? THE AGENT STOPS EXTRACTING UNTIL NEW ONES ARE SET [y/N] ") {
			fmt.Println("✖ CANCELLED.")
			return 1
		}
	}
	if resp, err := c.client().ClearCredentials(ctx); err == nil {
		if resp.Ok {
			fmt.Println("✔ CREDENTIALS REMOVED; the service is idle until `sdz-agent credentials set`.")
			return 0
		}
		fmt.Fprintln(os.Stderr, "✖", resp.Message)
		return 1
	}
	if _, err := os.Stat(c.paths.EnvFile()); err != nil {
		fmt.Println("✔ NOTHING TO REMOVE (not configured).")
		return 0
	}
	if err := os.Remove(c.paths.EnvFile()); err != nil {
		if errors.Is(err, os.ErrPermission) {
			fmt.Fprintf(os.Stderr, "✖ NO PERMISSION TO REMOVE %s (run as root/administrator)\n", c.paths.EnvFile())
			return 4
		}
		fmt.Fprintln(os.Stderr, "✖", err)
		return 1
	}
	fmt.Printf("✔ CREDENTIALS REMOVED. (%s)\n", c.paths.EnvFile())
	fmt.Println("  the service is not running; nothing else to do.")
	return 0
}
