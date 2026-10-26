package transports

import (
	"bytes"
	"context"
	"fmt"
	"path"
	"strings"
	"time"

	"github.com/aws/aws-sdk-go-v2/aws"
	awsconfig "github.com/aws/aws-sdk-go-v2/config"
	"github.com/aws/aws-sdk-go-v2/credentials"
	"github.com/aws/aws-sdk-go-v2/service/s3"
	"github.com/google/uuid"
	"github.com/seedz-ag/sdz-agent-go/internal/api"
	"github.com/seedz-ag/sdz-agent-go/internal/core"
)

var mimeTypes = map[string]string{".txt": "text/plain", ".csv": "text/csv", ".json": "application/json", ".xml": "application/xml", ".pdf": "application/pdf", ".zip": "application/zip"}

// S3 writes chunks/files straight to the raw bucket (channel SAAS_S3).
type S3 struct {
	api     *api.Service
	env     *core.Env
	logger  *core.Logger
	utils   *core.Utils
	client  *s3.Client
	setting *api.Setting
}

func NewS3(a *api.Service, env *core.Env, logger *core.Logger, utils *core.Utils) *S3 {
	return &S3{api: a, env: env, logger: logger, utils: utils}
}

func (t *S3) SetSetting(s *api.Setting) { t.setting = s }

func (t *S3) clientFor(ctx context.Context) (*s3.Client, error) {
	if t.client != nil {
		return t.client, nil
	}
	var opts []func(*awsconfig.LoadOptions) error
	if r := t.env.AmazonRegion(); r != "" {
		opts = append(opts, awsconfig.WithRegion(r))
	}
	if k, s := t.env.AmazonAccessKey(), t.env.AmazonSecretKey(); k != "" && s != "" {
		opts = append(opts, awsconfig.WithCredentialsProvider(credentials.NewStaticCredentialsProvider(k, s, "")))
	}
	cfg, err := awsconfig.LoadDefaultConfig(ctx, opts...)
	if err != nil {
		return nil, err
	}
	t.client = s3.NewFromConfig(cfg)
	return t.client, nil
}

func (t *S3) Send(ctx context.Context, resource string, data []any) error {
	t.logger.Info(fmt.Sprintf("SENDING %d LINES/FILE TO /%s", len(data), resource))
	if t.setting == nil {
		s, err := t.api.GetSetting(ctx)
		if err != nil {
			return err
		}
		t.setting = s
	}
	if err := t.upload(ctx, resource, data); err != nil {
		return err
	}
	t.utils.WaitCtx(ctx.Done(), t.env.Throttle())
	return nil
}

func (t *S3) upload(ctx context.Context, resource string, data []any) error {
	client, err := t.clientFor(ctx)
	if err != nil {
		return err
	}
	bucket := t.setting.Parameter("AMAZON_S3_RAW_BUCKET")
	date := time.Now().Format("2006-01-02")
	for _, item := range data {
		if file, ok := item.([]byte); ok {
			resourcePath := strings.Split(resource, "/")[0]
			fileName := path.Base(resource)
			ext := strings.ToLower(path.Ext(resource))
			if ext == "" {
				ext = ".txt"
			}
			key := fmt.Sprintf("%s/%s/%s/%s/%s", t.setting.TenantID, t.setting.ID, resourcePath, date, fileName)
			t.logger.Info(fmt.Sprintf("UPLOAD FTP FILE TO %s - %s", bucket, key))
			ct := mimeTypes[ext]
			if ct == "" {
				ct = "application/octet-stream"
			}
			_, err := client.PutObject(ctx, &s3.PutObjectInput{Bucket: aws.String(bucket), Key: aws.String(key), Body: bytes.NewReader(file), ContentType: aws.String(ct)})
			return err
		}
	}
	for _, chunk := range t.utils.Chunk(data) {
		t.logger.Info(fmt.Sprintf("SENDING CHUNK %d LINES TO /%s", len(chunk), resource))
		body, err := core.MarshalJSON(chunk, false)
		if err != nil {
			return err
		}
		key := fmt.Sprintf("%s/%s/%s/%s/%s.json", t.setting.TenantID, t.setting.ID, resource, date, uuid.NewString())
		if _, err := client.PutObject(ctx, &s3.PutObjectInput{Bucket: aws.String(bucket), Key: aws.String(key), Body: bytes.NewReader(body), ContentType: aws.String("application/json")}); err != nil {
			return err
		}
	}
	return nil
}
