package update

import (
	"context"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/seedz-ag/sdz-agent-go/internal/core"
)

func TestParseOptions(t *testing.T) {
	cases := []struct {
		args []any
		want Options
	}{
		{nil, Options{}},
		{[]any{"check"}, Options{CheckOnly: true}},
		{[]any{"force"}, Options{Force: true}},
		{[]any{"3.1.0"}, Options{Version: "3.1.0"}},
		{[]any{map[string]any{"version": "3.2.0", "force": true, "manifestUrl": "https://x/m.json"}}, Options{Version: "3.2.0", Force: true, ManifestURL: "https://x/m.json"}},
		{[]any{map[string]any{"check": "true"}}, Options{CheckOnly: true}},
	}
	for _, c := range cases {
		if got := ParseOptions(c.args); got != c.want {
			t.Errorf("ParseOptions(%v) = %+v, want %+v", c.args, got, c.want)
		}
	}
}

func testService(t *testing.T, manifestVersion string) (*Service, *[]string) {
	t.Helper()
	pkg := []byte("fake installer")
	sum := sha256.Sum256(pkg)
	mux := http.NewServeMux()
	srv := httptest.NewServer(mux)
	t.Cleanup(srv.Close)
	mux.HandleFunc("/pkg.deb", func(w http.ResponseWriter, _ *http.Request) { _, _ = w.Write(pkg) })
	mux.HandleFunc("/manifest.json", func(w http.ResponseWriter, _ *http.Request) {
		_ = json.NewEncoder(w).Encode(map[string]any{"version": manifestVersion,
			"packages": map[string]any{PackageKey(): map[string]any{"url": srv.URL + "/pkg.deb", "sha256": hex.EncodeToString(sum[:])}}})
	})
	paths := core.NewPathsAt(t.TempDir())
	t.Setenv(ManifestURLVariable, srv.URL+"/manifest.json")
	t.Setenv(PublicKeyVariable, "")
	env, _ := core.NewEnv(paths, true)
	s := New(env, paths, core.NewLogger())
	launched := &[]string{}
	s.Launch = func(file string) error { *launched = append(*launched, file); return nil }
	return s, launched
}

func TestPrepare(t *testing.T) {
	ctx := context.Background()

	s, launched := testService(t, "99.0.0")
	if r, launch := s.Prepare(ctx, Options{CheckOnly: true}); r.Status != "available" || launch != nil {
		t.Fatalf("check: %+v", r)
	}
	r, launch := s.Prepare(ctx, Options{})
	if r.Status != "updating" || r.Target != "99.0.0" || launch == nil {
		t.Fatalf("apply: %+v", r)
	}
	if r2, _ := s.Prepare(ctx, Options{}); r2.Status != "rejected" {
		t.Fatalf("concurrent update must be rejected: %+v", r2)
	}
	if err := launch(); err != nil || len(*launched) != 1 {
		t.Fatalf("launch: %v %v", err, *launched)
	}
	if r, _ := s.Prepare(ctx, Options{Version: "98.0.0"}); r.Status != "rejected" {
		t.Fatalf("pinned version mismatch: %+v", r)
	}
	if r, _ := s.Prepare(ctx, Options{ManifestURL: "https://elsewhere.example/m.json"}); r.Status != "rejected" {
		t.Fatalf("manifest override without public key: %+v", r)
	}

	old, _ := testService(t, "0.0.1")
	if r, l := old.Prepare(ctx, Options{}); r.Status != "up-to-date" || l != nil {
		t.Fatalf("older manifest: %+v", r)
	}
	if r, l := old.Prepare(ctx, Options{Force: true}); r.Status != "updating" || l == nil {
		t.Fatalf("force: %+v", r)
	} else {
		_ = l()
	}
}
