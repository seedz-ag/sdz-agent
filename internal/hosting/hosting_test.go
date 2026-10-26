package hosting

import "testing"

func TestIsServiceContextEnv(t *testing.T) {
	t.Setenv("SDZ_AGENT_SERVICE", "1")
	if !IsServiceContext() {
		t.Fatal("SDZ_AGENT_SERVICE=1 must mean service context")
	}
}
