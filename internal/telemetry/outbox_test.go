package telemetry

import (
	"path/filepath"
	"testing"
)

func TestOutboxAppendTrimRemove(t *testing.T) {
	o := NewOutboxAt(filepath.Join(t.TempDir(), "sub", "outbox.jsonl"), 3)
	if err := o.Append([]any{map[string]int{"a": 1}, map[string]int{"a": 2}}); err != nil {
		t.Fatal(err)
	}
	if got := o.ReadAll(); len(got) != 2 {
		t.Fatalf("read %d", len(got))
	}
	_ = o.Append([]any{map[string]int{"a": 3}, map[string]int{"a": 4}})
	got := o.ReadAll()
	if len(got) != 3 || got[0] != `{"a":2}` {
		t.Fatalf("trim failed: %v", got)
	}
	if err := o.RemoveFirst(2); err != nil {
		t.Fatal(err)
	}
	if got := o.ReadAll(); len(got) != 1 || got[0] != `{"a":4}` {
		t.Fatalf("removeFirst: %v", got)
	}
	_ = o.RemoveFirst(10)
	if len(o.ReadAll()) != 0 {
		t.Fatal("expected empty")
	}
}
