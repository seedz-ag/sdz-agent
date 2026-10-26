package drivers_test

import (
	"context"
	"encoding/json"
	"os"
	"strings"
	"testing"

	"github.com/seedz-ag/sdz-agent-go/internal/api"
	"github.com/seedz-ag/sdz-agent-go/internal/core"
	"github.com/seedz-ag/sdz-agent-go/internal/data"
	_ "github.com/seedz-ag/sdz-agent-go/internal/data/drivers"
)

// Runs only with SDZ_TEST_MYSQL_HOST/PORT/USER/PASSWORD set (e.g. the SEEDZ "MYSQL - NAO REMOVER MINIMO" dev setting).
func newDispatcher(t *testing.T) (*data.Dispatcher, []api.Parameter) {
	t.Helper()
	host := os.Getenv("SDZ_TEST_MYSQL_HOST")
	if host == "" {
		t.Skip("SDZ_TEST_MYSQL_HOST not set")
	}
	port := os.Getenv("SDZ_TEST_MYSQL_PORT")
	if port == "" {
		port = "3306"
	}
	dir := t.TempDir()
	paths := core.NewPathsAt(dir)
	env, err := core.NewEnv(paths, true)
	if err != nil {
		t.Fatal(err)
	}
	logger := core.NewLogger()
	params := []api.Parameter{
		{Key: "DATABASE_DRIVER", Value: "MYSQL"},
		{Key: "DATABASE_HOST", Value: host},
		{Key: "DATABASE_PORT", Value: port},
		{Key: "DATABASE_USERNAME", Value: os.Getenv("SDZ_TEST_MYSQL_USER")},
		{Key: "DATABASE_PASSWORD", Value: os.Getenv("SDZ_TEST_MYSQL_PASSWORD")},
		{Key: "LAST_EXTRACTION", Value: "2026-10-18"},
	}
	d := data.NewDispatcher(env, logger)
	if err := d.Initialize(context.Background(), "MYSQL", data.ConfigFromParameters(params), params); err != nil {
		t.Fatal(err)
	}
	return d, params
}

func TestMySQLConnectsAndChecks(t *testing.T) {
	d, _ := newDispatcher(t)
	defer d.Disconnect(context.Background())
	ok, err := d.CheckConnection(context.Background())
	if err != nil || !ok {
		t.Fatalf("check connection: ok=%v err=%v", ok, err)
	}
	v, err := d.GetVersion(context.Background())
	if err != nil || !strings.Contains(v, ".") {
		t.Fatalf("version: %q err=%v", v, err)
	}
}

func TestMySQLPaginatesAndSerializes(t *testing.T) {
	d, _ := newDispatcher(t)
	defer d.Disconnect(context.Background())
	ctx := context.Background()
	zero, one := 0, 1
	page0, err := d.Query(ctx, "SELECT * FROM agent_mock.clientes", &zero, 5)
	if err != nil || len(page0) == 0 || len(page0) > 5 {
		t.Fatalf("page0: %d rows err=%v", len(page0), err)
	}
	page1, _ := d.Query(ctx, "SELECT * FROM agent_mock.clientes", &one, 5)
	all, _ := d.Query(ctx, "SELECT * FROM agent_mock.clientes", nil, 0)
	if len(all) < len(page0) {
		t.Fatalf("all=%d < page0=%d", len(all), len(page0))
	}
	if len(all) > 5 {
		a, _ := json.Marshal(page0[0])
		b, _ := json.Marshal(page1[0])
		if string(a) == string(b) {
			t.Fatal("page 1 returned the same first row as page 0")
		}
	}
	out, err := core.MarshalJSON(page0, true)
	if err != nil || !strings.Contains(string(out), `"id"`) || strings.Contains(string(out), "DBNull") {
		t.Fatalf("serialisation: %v %s", err, string(out)[:200])
	}
	for _, table := range []string{"itens_de_nota", "notas", "itens", "itens_de_pedido", "pedidos", "contas_a_receber", "vendedores"} {
		if _, err := d.Query(ctx, "SELECT * FROM agent_mock."+table, &zero, 3); err != nil {
			t.Fatalf("%s: %v", table, err)
		}
	}
}

func TestMySQLRemoteQueryReturnsRowsOrError(t *testing.T) {
	d, _ := newDispatcher(t)
	defer d.Disconnect(context.Background())
	ok, _ := d.ExecuteQueryRemote(context.Background(), "SELECT 1 AS one")
	if _, isRows := ok.([]*core.Row); !isRows {
		t.Fatalf("expected rows, got %T", ok)
	}
	bad, _ := d.ExecuteQueryRemote(context.Background(), "SELECT * FROM agent_mock.tabela_que_nao_existe")
	if _, isString := bad.(string); !isString {
		t.Fatalf("expected error string, got %T", bad)
	}
}
