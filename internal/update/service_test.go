package update

import (
	"context"
	"crypto/ecdsa"
	"crypto/elliptic"
	"crypto/rand"
	"crypto/sha256"
	"crypto/x509"
	"encoding/base64"
	"encoding/json"
	"encoding/pem"
	"net/http"
	"net/http/httptest"
	"os"
	"regexp"
	"testing"

	"github.com/seedz-ag/sdz-agent-go/internal/core"
)

func TestIsNewer(t *testing.T) {
	cases := []struct {
		c, cur string
		want   bool
	}{{"3.0.1", "3.0.0", true}, {"v3.1.0", "3.0.9", true}, {"3.0.0", "3.0.0", false}, {"2.9.9", "3.0.0", false}, {"3.0.0-beta.1", "3.0.0", false}, {"3.1", "3.0.5", true}, {"x", "1.0.0", false}}
	for _, c := range cases {
		if got := IsNewer(c.c, c.cur); got != c.want {
			t.Errorf("IsNewer(%s,%s)=%v", c.c, c.cur, got)
		}
	}
}

func TestPackageKeyFormat(t *testing.T) {
	if !regexp.MustCompile(`^(win|osx|linux)-(x64|arm64)(-(deb|rpm))?$`).MatchString(PackageKey()) {
		t.Fatal(PackageKey())
	}
}

func signedManifest(t *testing.T) (string, string) {
	t.Helper()
	key, _ := ecdsa.GenerateKey(elliptic.P256(), rand.Reader)
	packages := `{"linux-x64-deb":{"url":"https://x/a.deb","sha256":"abc"}}`
	digest := sha256.Sum256([]byte(packages))
	sig, _ := ecdsa.SignASN1(rand.Reader, key, digest[:])
	manifest := `{"version":"9.0.0","channel":"stable","packages":` + packages + `,"signature":"` + base64.StdEncoding.EncodeToString(sig) + `"}`
	der, _ := x509.MarshalPKIXPublicKey(&key.PublicKey)
	pub := string(pem.EncodeToMemory(&pem.Block{Type: "PUBLIC KEY", Bytes: der}))
	return manifest, pub
}

func TestManifestSignature(t *testing.T) {
	manifest, pub := signedManifest(t)
	m, err := ParseManifest([]byte(manifest), pub)
	if err != nil || m.Version != "9.0.0" || m.Packages["linux-x64-deb"].SHA256 != "abc" {
		t.Fatalf("parse: %v %+v", err, m)
	}
	tampered := []byte(regexp.MustCompile(`"sha256":"abc"`).ReplaceAllString(manifest, `"sha256":"evil"`))
	if _, err := ParseManifest(tampered, pub); err == nil {
		t.Fatal("tampered manifest accepted")
	}
	unsigned := `{"version":"9.0.0","packages":{}}`
	if _, err := ParseManifest([]byte(unsigned), pub); err == nil {
		t.Fatal("unsigned manifest accepted with a key")
	}
	if _, err := ParseManifest([]byte(unsigned), ""); err != nil {
		t.Fatal("unsigned manifest must pass without a key")
	}
}

func TestCheckAndApplyDownloadsVerifiesAndLaunches(t *testing.T) {
	payload := []byte("fake-package")
	sum := sha256.Sum256(payload)
	mux := http.NewServeMux()
	mux.HandleFunc("/pkg.deb", func(w http.ResponseWriter, r *http.Request) { w.Write(payload) })
	var srv *httptest.Server
	mux.HandleFunc("/manifest.json", func(w http.ResponseWriter, r *http.Request) {
		m := Manifest{Version: "99.0.0", Packages: map[string]Package{PackageKey(): {URL: srv.URL + "/pkg.deb", SHA256: hexString(sum[:])}}}
		_ = json.NewEncoder(w).Encode(m)
	})
	srv = httptest.NewServer(mux)
	defer srv.Close()

	paths := core.NewPathsAt(t.TempDir())
	t.Setenv(ManifestURLVariable, srv.URL+"/manifest.json")
	env, _ := core.NewEnv(paths, true)
	s := New(env, paths, core.NewLogger())
	launched := ""
	s.Launch = func(file string) error { launched = file; return nil }

	v, err := s.CheckAndApply(context.Background(), false)
	if err != nil || v != "99.0.0" || launched != "" {
		t.Fatalf("check only: %v %s %s", err, v, launched)
	}
	v, err = s.CheckAndApply(context.Background(), true)
	if err != nil || v != "99.0.0" || launched == "" {
		t.Fatalf("apply: %v %s %s", err, v, launched)
	}
	if _, err := os.Stat(s.statePath()); err != nil {
		t.Fatal("state.json missing")
	}
	if st := s.loadState(); st == nil || st.TargetVersion != "99.0.0" || st.Healthy {
		t.Fatalf("state %+v", st)
	}
}

func hexString(b []byte) string {
	const digits = "0123456789abcdef"
	out := make([]byte, len(b)*2)
	for i, v := range b {
		out[i*2], out[i*2+1] = digits[v>>4], digits[v&0xf]
	}
	return string(out)
}
