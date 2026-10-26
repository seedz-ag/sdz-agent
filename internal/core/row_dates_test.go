package core

import (
	"testing"
	"time"
)

func TestEncodeTypedDatesAndNumbers(t *testing.T) {
	r := NewRow()
	at := time.Date(2025, 4, 9, 13, 5, 7, 0, time.FixedZone("BRT", -3*3600))
	r.Set("d", DateOnly(at))
	r.Set("u", UTCTime(at))
	r.Set("t", at)
	b, err := r.MarshalJSON()
	if err != nil {
		t.Fatal(err)
	}
	want := `{"d":"2025-04-09","u":"2025-04-09T16:05:07.000Z","t":"2025-04-09T13:05:07.000"}`
	if string(b) != want {
		t.Fatalf("got %s want %s", b, want)
	}
	for in, out := range map[string]string{"4599.0": "4599", "12.50": "12.5", "100": "100", "0.0": "0", "-3.000": "-3", "1e3": "1e3", "7.25": "7.25"} {
		if got := NormalizeNumber(in); got != out {
			t.Errorf("NormalizeNumber(%q)=%q want %q", in, got, out)
		}
	}
}
