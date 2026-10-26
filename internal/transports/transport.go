// Package transports sends extracted rows to the platform (HTTP API or S3).
package transports

import "context"

type Transport interface {
	Send(ctx context.Context, resource string, data []any) error
}
