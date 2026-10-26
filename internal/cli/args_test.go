package cli

import "testing"

func TestParse(t *testing.T) {
	a := Parse([]string{"check", "auth", "--use-console-log", "-n", "5", "--schema=orders", "--no-listen"})
	if a.Command != "check" || a.Positional[0] != "auth" || !a.Flag("use-console-log", false) || a.Get("extract-last-n-days") != "5" || a.Get("schema") != "orders" || a.Flag("listen", true) {
		t.Fatalf("%+v", a)
	}
	b := Parse([]string{"configure", "--client-id", "abc", "--client-secret", "s3cr3t", "--non-interactive"})
	if b.Get("client-id") != "abc" || b.Get("client-secret") != "s3cr3t" || !b.Flag("non-interactive", false) {
		t.Fatalf("%+v", b)
	}
}
