package commands

import "testing"

func TestMask(t *testing.T) {
	cases := map[string]string{
		"":         "-",
		"abc":      "•••",
		"12345678": "••••••••",
		"abcd1234efgh5678ijkl9012mnop3456qrst7890uvwx1234wxyz": "abcd…wxyz",
	}
	for in, want := range cases {
		if got := Mask(in); got != want {
			t.Errorf("Mask(%q) = %q, want %q", in, got, want)
		}
	}
}

func TestResolveCredentials(t *testing.T) {
	env := map[string]string{ClientIDVariable: "env-id", ClientSecretVariable: "env-secret", APIURLVariable: "https://env/"}
	getenv := func(k string) string { return env[k] }

	id, secret, api := ResolveCredentials(CredentialsOptions{}, getenv, func() string { return "" })
	if id != "env-id" || secret != "env-secret" || api != "https://env/" {
		t.Fatalf("env fallback: %q %q %q", id, secret, api)
	}
	id, secret, api = ResolveCredentials(CredentialsOptions{ClientID: " cli-id ", SecretFromStdin: true}, getenv, func() string { return "stdin-secret\n" })
	if id != "cli-id" || secret != "stdin-secret" || api != "https://env/" {
		t.Fatalf("stdin: %q %q %q", id, secret, api)
	}
	id, secret, api = ResolveCredentials(CredentialsOptions{ClientID: "a", ClientSecret: "b", APIURL: "https://cli/", SecretFromStdin: true}, getenv, func() string { return "ignored" })
	if id != "a" || secret != "b" || api != "https://cli/" {
		t.Fatalf("cli wins: %q %q %q", id, secret, api)
	}
	id, secret, api = ResolveCredentials(CredentialsOptions{SecretFromStdin: true}, func(string) string { return "" }, func() string { return "   " })
	if id != "" || secret != "" || api != "" {
		t.Fatalf("nothing: %q %q %q", id, secret, api)
	}
}
