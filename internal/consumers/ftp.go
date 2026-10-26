package consumers

import (
	"context"
	"errors"
	"fmt"
	"io"
	"os"
	"strconv"
	"strings"
	"time"

	"github.com/pkg/sftp"
	"github.com/seedz-ag/sdz-agent-go/internal/api"
	"github.com/seedz-ag/sdz-agent-go/internal/core"
	"github.com/seedz-ag/sdz-agent-go/internal/transports"
	"golang.org/x/crypto/ssh"
)

// SFTPClient is the port of FTPAdapter (ssh2-sftp-client).
type SFTPClient struct {
	logger   *core.Logger
	host     string
	port     int
	username string
	password string
	ssh      *ssh.Client
	sftp     *sftp.Client
}

func NewSFTPClient(logger *core.Logger) *SFTPClient { return &SFTPClient{logger: logger, port: 22} }

func (c *SFTPClient) SetConfig(host, username, password string, port int) {
	c.host, c.username, c.password = host, username, password
	if port > 0 {
		c.port = port
	}
}

func (c *SFTPClient) Connect() error {
	if c.sftp != nil {
		return nil
	}
	cfg := &ssh.ClientConfig{
		User:            c.username,
		Auth:            []ssh.AuthMethod{ssh.Password(c.password)},
		HostKeyCallback: ssh.InsecureIgnoreHostKey(), //nolint:gosec // same trust model as ssh2-sftp-client defaults
		Timeout:         20 * time.Second,
	}
	conn, err := ssh.Dial("tcp", fmt.Sprintf("%s:%d", c.host, c.port), cfg)
	if err != nil {
		c.logger.Error("INVALID FTP CONFIGURATION.")
		return err
	}
	client, err := sftp.NewClient(conn)
	if err != nil {
		conn.Close()
		c.logger.Error("INVALID FTP CONFIGURATION.")
		return err
	}
	c.ssh, c.sftp = conn, client
	return nil
}

func (c *SFTPClient) Disconnect() {
	if c.sftp != nil {
		c.sftp.Close()
		c.sftp = nil
	}
	if c.ssh != nil {
		c.ssh.Close()
		c.ssh = nil
	}
}

func (c *SFTPClient) List(path, extension string) ([]os.FileInfo, error) {
	if err := c.Connect(); err != nil {
		return nil, err
	}
	entries, err := c.sftp.ReadDir(path)
	if err != nil {
		c.logger.Error(fmt.Sprintf("ERROR LISTING %s AT FTP.", path), err.Error())
		return nil, err
	}
	if extension == "" {
		return entries, nil
	}
	ext := strings.ToLower(extension)
	if !strings.HasPrefix(ext, ".") {
		ext = "." + ext
	}
	var out []os.FileInfo
	for _, e := range entries {
		if strings.HasSuffix(strings.ToLower(e.Name()), ext) {
			out = append(out, e)
		}
	}
	return out, nil
}

func (c *SFTPClient) GetFile(remote string) ([]byte, error) {
	if err := c.Connect(); err != nil {
		return nil, err
	}
	c.logger.Infof("DOWNLOADING %s FROM FTP.", remote)
	f, err := c.sftp.Open(remote)
	if err != nil {
		c.logger.Errorf("ERROR DOWNLOADING %s FROM FTP.", remote)
		return nil, err
	}
	defer f.Close()
	b, err := io.ReadAll(f)
	if err != nil {
		c.logger.Errorf("ERROR DOWNLOADING %s FROM FTP.", remote)
		return nil, err
	}
	c.logger.Infof("DOWNLOADED %s FROM FTP.", remote)
	return b, nil
}

// FTP downloads every file of the configured extension and ships it through the transport.
type FTP struct {
	env       *core.Env
	paths     *core.Paths
	client    *SFTPClient
	logger    *core.Logger
	setting   *api.Setting
	transport transports.Transport
}

func NewFTP(env *core.Env, paths *core.Paths, client *SFTPClient, logger *core.Logger) *FTP {
	return &FTP{env: env, paths: paths, client: client, logger: logger}
}

func (c *FTP) SetSetting(s *api.Setting) Consumer {
	c.setting = s
	cfg := map[string]string{}
	for _, p := range s.Parameters {
		if strings.HasPrefix(p.Key, "FTP_") {
			cfg[strings.ToLower(strings.TrimPrefix(p.Key, "FTP_"))] = p.Value
		}
	}
	port, _ := strconv.Atoi(cfg["port"])
	c.client.SetConfig(cfg["host"], cfg["username"], cfg["password"], port)
	return c
}

func (c *FTP) SetTransport(t transports.Transport) Consumer { c.transport = t; return c }

func (c *FTP) Consume(ctx context.Context) error {
	if t := c.env.Type(); t == "all" || t == "datasource" {
		if err := c.client.Connect(); err != nil {
			return err
		}
		c.client.Disconnect()
		return nil
	}
	scope := c.env.Schema()
	for _, schema := range c.setting.Schemas {
		if ctx.Err() != nil {
			return ctx.Err()
		}
		if scope != "" && schema.Entity != scope {
			continue
		}
		if schema.InputFormat != "AGENT" && hasAgentSchemaForEntity(c.setting.Schemas, schema.Entity) {
			continue
		}
		var query *api.Query
		for i := range c.setting.Queries {
			if c.setting.Queries[i].Entity == schema.Entity {
				query = &c.setting.Queries[i]
				break
			}
		}
		if query == nil {
			c.logger.Error("COULDN'T FIND QUERY COMMAND")
			return errors.New("COULDN'T FIND QUERY COMMAND")
		}
		c.logger.Infof("CONSUMING %s", strings.ToUpper(schema.Entity))
		_ = os.MkdirAll(c.paths.OutputDir(), 0o750)
		if b, err := core.MarshalJSON(query, false); err == nil {
			_ = os.WriteFile(c.paths.Output(strings.ToLower(schema.Entity)+".json"), b, 0o640)
		}
		if err := c.client.Connect(); err != nil {
			return err
		}
		files, err := c.client.List(query.Command, schema.InputFormat)
		if err != nil {
			return err
		}
		for i, f := range files {
			b, err := c.client.GetFile(query.Command + f.Name())
			if err == nil {
				err = c.transport.Send(ctx, schema.Entity+"/"+f.Name(), []any{b})
			}
			if err != nil {
				c.logger.Error(fmt.Sprintf("ERROR PROCESSING FILE %s", f.Name()), err.Error())
			}
			if i < len(files)-1 {
				select {
				case <-time.After(time.Second):
				case <-ctx.Done():
					return ctx.Err()
				}
			}
		}
		c.client.Disconnect()
	}
	return nil
}
