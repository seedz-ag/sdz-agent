package commands

import (
	"bufio"
	"context"
	"errors"
	"fmt"
	"net/url"
	"os"
	"strings"

	"github.com/seedz-ag/sdz-agent-go/internal/core"
	"golang.org/x/term"
)

const DefaultAPIURL = "https://api.integration.seedz.ag/integration/v1/"

type ConfigureOptions struct {
	ClientID, ClientSecret, APIURL string
	NonInteractive, Overwrite      bool
}

// Configure validates credentials against the auth endpoint and writes the .env (port of ConfigureCommand).
type Configure struct {
	http  *core.HTTPClient
	paths *core.Paths
}

func NewConfigure(http *core.HTTPClient, paths *core.Paths) *Configure {
	return &Configure{http: http, paths: paths}
}

func NormalizeAPIURL(u string) (string, error) {
	u = strings.TrimSpace(u)
	if u == "" {
		u = DefaultAPIURL
	}
	if !strings.HasSuffix(u, "/") {
		u += "/"
	}
	if p, err := url.Parse(u); err != nil || p.Scheme == "" || p.Host == "" {
		return "", errors.New("INVALID API URL")
	}
	return u, nil
}

func (c *Configure) Validate(ctx context.Context, apiURL, clientID, clientSecret string) bool {
	_, err := c.http.Post(ctx, apiURL+"auth", map[string]string{"clientId": clientID, "clientSecret": clientSecret}, nil, 30_000)
	return err == nil
}

// Save validates and persists; returns an error with a user-facing message.
func (c *Configure) Save(ctx context.Context, clientID, clientSecret, apiURL string) error {
	u, err := NormalizeAPIURL(apiURL)
	if err != nil {
		return err
	}
	clientID, clientSecret = strings.TrimSpace(clientID), strings.TrimSpace(clientSecret)
	if clientID == "" || clientSecret == "" {
		return errors.New("CLIENT ID AND CLIENT SECRET ARE REQUIRED")
	}
	if !c.Validate(ctx, u, clientID, clientSecret) {
		return errors.New("INVALID CREDENTIALS")
	}
	if err := c.paths.EnsureDirectories(); err != nil {
		return err
	}
	return core.WriteDotEnv(c.paths.EnvFile(), [][2]string{{"API_URL", u}, {"CLIENT_ID", clientID}, {"CLIENT_SECRET", clientSecret}})
}

// RunCLI is the interactive/non-interactive `sdz-agent configure`; returns the exit code.
func (c *Configure) RunCLI(ctx context.Context, o ConfigureOptions) int {
	apiURL, err := NormalizeAPIURL(o.APIURL)
	if err != nil {
		fmt.Fprintln(os.Stderr, "✖ INVALID API URL")
		return 2
	}
	if _, err := os.Stat(c.paths.EnvFile()); err == nil && !o.Overwrite && !o.NonInteractive {
		if !confirm("YOUR AGENT SEEMS TO BE CONFIGURED, OVERWRITE? [y/N] ") {
			fmt.Println("✖ CONFIGURATION CANCELLED.")
			return 1
		}
	}
	clientID, clientSecret := o.ClientID, o.ClientSecret
	for {
		if strings.TrimSpace(clientID) == "" || strings.TrimSpace(clientSecret) == "" {
			if o.NonInteractive {
				fmt.Fprintln(os.Stderr, "✖ CLIENT ID AND CLIENT SECRET ARE REQUIRED (--client-id / --client-secret).")
				return 2
			}
			clientID = prompt("WHAT'S YOUR CLIENT ID? ")
			clientSecret = promptSecret("WHAT'S YOUR CLIENT SECRET? ")
		}
		if c.Validate(ctx, apiURL, strings.TrimSpace(clientID), strings.TrimSpace(clientSecret)) {
			break
		}
		fmt.Println("✖ INVALID CREDENTIALS")
		if o.NonInteractive {
			return 3
		}
		clientID, clientSecret = "", ""
	}
	if err := c.paths.EnsureDirectories(); err != nil {
		fmt.Fprintln(os.Stderr, "✖", err)
		return 1
	}
	if err := core.WriteDotEnv(c.paths.EnvFile(), [][2]string{{"API_URL", apiURL}, {"CLIENT_ID", strings.TrimSpace(clientID)}, {"CLIENT_SECRET", strings.TrimSpace(clientSecret)}}); err != nil {
		fmt.Fprintln(os.Stderr, "✖", err)
		return 1
	}
	fmt.Printf("✔ CONFIGURATION SAVED. (%s)\n", c.paths.EnvFile())
	return 0
}

func prompt(msg string) string {
	fmt.Print(msg)
	line, _ := bufio.NewReader(os.Stdin).ReadString('\n')
	return strings.TrimSpace(line)
}

func confirm(msg string) bool {
	a := strings.ToLower(prompt(msg))
	return a == "y" || a == "yes" || a == "s" || a == "sim"
}

func promptSecret(msg string) string {
	fmt.Print(msg)
	if term.IsTerminal(int(os.Stdin.Fd())) {
		b, err := term.ReadPassword(int(os.Stdin.Fd()))
		fmt.Println()
		if err == nil {
			return strings.TrimSpace(string(b))
		}
	}
	line, _ := bufio.NewReader(os.Stdin).ReadString('\n')
	return strings.TrimSpace(line)
}
