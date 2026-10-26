//go:build !odbc

package drivers

import (
	"context"
	"errors"

	"github.com/seedz-ag/sdz-agent-go/internal/api"
	"github.com/seedz-ag/sdz-agent-go/internal/core"
	"github.com/seedz-ag/sdz-agent-go/internal/data"
)

var errNoODBC = errors.New("ODBC support not compiled in (build with -tags odbc)")

// odbcDriver placeholder for builds without CGO/unixODBC.
type odbcDriver struct{ logger *core.Logger }

func newOdbc(_ data.Config, logger *core.Logger) data.Adapter { return &odbcDriver{logger: logger} }

func (d *odbcDriver) BuildQuery(string, []api.Parameter) (string, bool) { return "", false }
func (d *odbcDriver) CheckConnection(context.Context) (bool, bool)      { return false, false }
func (d *odbcDriver) Connect(context.Context) error {
	d.logger.Error("ODBC CONNECT ERROR", errNoODBC)
	return errNoODBC
}
func (d *odbcDriver) Disconnect(context.Context) error { return nil }
func (d *odbcDriver) Execute(_ context.Context, query string) ([]*core.Row, error) {
	d.logger.Error("ODBC EXECUTE ERROR", query, errNoODBC)
	return []*core.Row{}, nil
}
func (d *odbcDriver) ExecuteQueryRemote(context.Context, string) (any, error) { return errNoODBC.Error(), nil }
func (d *odbcDriver) GetVersion(context.Context) (string, error)              { return "", nil }
func (d *odbcDriver) Query(ctx context.Context, query string, _ *int, _ int) ([]*core.Row, error) {
	return d.Execute(ctx, query)
}
