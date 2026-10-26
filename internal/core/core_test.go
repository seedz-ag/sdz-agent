package core

import (
	"encoding/json"
	"os"
	"path/filepath"
	"testing"
	"time"
)

func TestRowKeepsOrderInJSON(t *testing.T) {
	r := NewRow()
	r.Set("zeta", 1)
	r.Set("alpha", "x")
	r.Set("mid", nil)
	b, _ := json.Marshal(r)
	if string(b) != `{"zeta":1,"alpha":"x","mid":null}` {
		t.Fatal(string(b))
	}
	v, err := ParseJSON([]byte(`{"b":1,"a":[{"c":2}],"n":1.5}`))
	if err != nil {
		t.Fatal(err)
	}
	row := v.(*Row)
	if k := row.Keys(); k[0] != "b" || k[1] != "a" || k[2] != "n" {
		t.Fatal(k)
	}
	if _, ok := row.m["n"].(json.Number); !ok {
		t.Fatal("numbers must stay json.Number")
	}
}

func TestRowEncodesTime(t *testing.T) {
	r := NewRow()
	r.Set("when", time.Date(2026, 10, 20, 8, 0, 0, 0, time.Local))
	r.Set("list", []any{time.Date(2026, 1, 1, 0, 0, 0, 0, time.Local)})
	b, _ := json.Marshal(r)
	if string(b) != `{"when":"2026-10-20T08:00:00.000","list":["2026-01-01T00:00:00.000"]}` {
		t.Fatal(string(b))
	}
}

func TestDotEnvRoundTrip(t *testing.T) {
	dir := t.TempDir()
	p := filepath.Join(dir, ".env")
	if err := WriteDotEnv(p, [][2]string{{"API_URL", "https://x/"}, {"CLIENT_SECRET", "a b#c"}}); err != nil {
		t.Fatal(err)
	}
	got := ReadDotEnv(p)
	if got["API_URL"] != "https://x/" || got["CLIENT_SECRET"] != "a b#c" {
		t.Fatal(got)
	}
	_ = os.WriteFile(p, []byte("API_URL=https://api/\nCLIENT_ID=abc\nCLIENT_SECRET=def\n# c\nexport FOO='bar'\n"), 0o600)
	got = ReadDotEnv(p)
	if got["CLIENT_ID"] != "abc" || got["FOO"] != "bar" {
		t.Fatal(got)
	}
}

func TestEnvValidationAndLayers(t *testing.T) {
	// isolate from a developer shell that exported the agent credentials
	for _, k := range []string{"API_URL", "CLIENT_ID", "CLIENT_SECRET", "ENV", "CHUNK_SIZE", "EXTRACT_LAST_N_DAYS", "USE_CONSOLE_LOG"} {
		t.Setenv(k, "")
	}
	dir := t.TempDir()
	paths := NewPathsAt(dir)
	if _, err := NewEnv(paths, false); err == nil {
		t.Fatal("expected validation error")
	}
	env, err := NewEnv(paths, true)
	if err != nil {
		t.Fatal(err)
	}
	if env.APIRequestTimeout() != 300_000 || env.ChunkSize() != 500 || env.Retries() != 3 {
		t.Fatal("defaults")
	}
	_ = os.WriteFile(paths.EnvFile(), []byte("API_URL=https://api.example.com/v1\nCLIENT_ID=id\nCLIENT_SECRET=secret\nCHUNK_SIZE=50\n"), 0o600)
	env, err = NewEnv(paths, false)
	if err != nil {
		t.Fatal(err)
	}
	_ = env.Merge(map[string]string{"chunk-size": "999", "use-console-log": "true", "extract-last-n-days": "4"})
	if env.APIURL() != "https://api.example.com/v1/" || env.ChunkSize() != 50 || !env.UseConsoleLog() || env.ExtractLastNDays() != 4 || env.IsRedirected() {
		t.Fatalf("layers: %s %d %v %d", env.APIURL(), env.ChunkSize(), env.UseConsoleLog(), env.ExtractLastNDays())
	}
	_ = os.WriteFile(paths.EnvFile(), []byte("API_URL=https://a/\nCLIENT_ID=i\nCLIENT_SECRET=s\nENV=XYZ\n"), 0o600)
	if _, err := NewEnv(paths, false); err == nil {
		t.Fatal("ENV enum")
	}
	_ = os.WriteFile(paths.EnvFile(), []byte("API_URL=https://prd/\nCLIENT_ID=prd-id\nCLIENT_SECRET=prd-secret\nENV=SND\n"), 0o600)
	env, _ = NewEnv(paths, false)
	body := &DiscoveryBody{APIURL: "https://snd/"}
	body.Credentials.ClientID, body.Credentials.ClientSecret = "snd-id", "snd-secret"
	env.SetDiscovery(Discovery{"SND": body})
	if env.APIURL() != "https://snd/" || env.ClientID() != "snd-id" || env.BaseClientID() != "prd-id" || !env.IsRedirected() {
		t.Fatal("discovery")
	}
}

func TestChunkAndRetry(t *testing.T) {
	if len(Chunk([]int{}, 10)) != 1 || len(Chunk([]int{1, 2, 3}, 2)) != 2 {
		t.Fatal("chunk")
	}
	if CalculateRetryTime(2, 1000) != 4000 {
		t.Fatal("retry")
	}
}
