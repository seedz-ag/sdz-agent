package transports

import (
	"context"
	"encoding/base64"
	"fmt"

	"github.com/seedz-ag/sdz-agent-go/internal/api"
	"github.com/seedz-ag/sdz-agent-go/internal/core"
)

type HTTP struct {
	api    *api.Service
	env    *core.Env
	utils  *core.Utils
	logger *core.Logger
}

func NewHTTP(a *api.Service, env *core.Env, utils *core.Utils, logger *core.Logger) *HTTP {
	return &HTTP{api: a, env: env, utils: utils, logger: logger}
}

func (t *HTTP) Send(ctx context.Context, resource string, data []any) error {
	t.logger.Info(fmt.Sprintf("SENDING %d LINES TO /%s", len(data), resource))
	for _, chunk := range t.utils.Chunk(data) {
		t.logger.Info(fmt.Sprintf("SENDING CHUNK %d LINES TO /%s", len(chunk), resource))
		payload := make([]any, len(chunk))
		for i, item := range chunk {
			if b, ok := item.([]byte); ok {
				payload[i] = base64.StdEncoding.EncodeToString(b)
			} else {
				payload[i] = item
			}
		}
		if err := t.api.SendResource(ctx, resource, payload); err != nil {
			return err
		}
		t.utils.WaitCtx(ctx.Done(), t.env.Throttle())
	}
	return nil
}
