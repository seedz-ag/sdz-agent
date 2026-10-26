package api

import (
	"context"
	"encoding/base64"
	"encoding/json"
	"fmt"
	"os"
	"time"

	"github.com/google/uuid"
	"github.com/seedz-ag/sdz-agent-go/internal/core"
	"github.com/seedz-ag/sdz-agent-go/internal/telemetry"
)

// Service is the port of APIService: the integration API client used by every command.
type Service struct {
	env      *core.Env
	paths    *core.Paths
	http     *core.HTTPClient
	logger   *core.Logger
	recorder *telemetry.Recorder
	utils    *core.Utils
	fileLog  *core.FileLogWriter
}

func NewService(env *core.Env, paths *core.Paths, http *core.HTTPClient, logger *core.Logger, recorder *telemetry.Recorder, utils *core.Utils) *Service {
	return &Service{env: env, paths: paths, http: http, logger: logger, recorder: recorder, utils: utils, fileLog: core.NewFileLogWriter(paths)}
}

func BasicAuth(clientID, clientSecret string) string {
	return "Basic " + base64.StdEncoding.EncodeToString([]byte(clientID+":"+clientSecret))
}

func (s *Service) Headers() map[string]string {
	return map[string]string{
		"Authorization":  BasicAuth(s.env.ClientID(), s.env.ClientSecret()),
		"sdz-request-id": uuid.NewString(),
	}
}

func (s *Service) logHeaders() map[string]string {
	return map[string]string{
		"Authorization":  BasicAuth(s.env.BaseClientID(), s.env.BaseClientSecret()),
		"sdz-request-id": uuid.NewString(),
	}
}

func (s *Service) Discovery(ctx context.Context) (core.Discovery, error) {
	s.logger.Info("DISCOVERING")
	resp, err := s.http.Get(ctx, s.env.APIURL()+"discovery", s.Headers(), s.env.APIRequestTimeout())
	if err != nil {
		return nil, err
	}
	d := core.Discovery{}
	if err := resp.DecodeJSON(&d); err != nil {
		return nil, err
	}
	return d, nil
}

func (s *Service) GetSetting(ctx context.Context) (*Setting, error) {
	s.logger.Infof("ENVIRONMENT %s", s.env.APIURL())
	s.logger.Info("GETTING SETTING")
	resp, err := s.http.Get(ctx, s.env.APIURL()+"settings", s.Headers(), s.env.APIRequestTimeout())
	if err != nil {
		return nil, err
	}
	var setting Setting
	if err := resp.DecodeJSON(&setting); err != nil || setting.ID == "" && setting.Channel == "" {
		s.logger.Error("SETTING NOT FOUND")
		if err == nil {
			err = fmt.Errorf("SETTING NOT FOUND")
		}
		return nil, err
	}
	s.logger.Info("SETTING ACQUIRED")
	return s.applyOverride(&setting), nil
}

// applyOverride: SDZ_AGENT_SETTING_OVERRIDE=<file.json> with {"Parameters":{K:V},"Queries":{entity:command}} (dev/test aid).
func (s *Service) applyOverride(setting *Setting) *Setting {
	path := s.env.GetOrEmpty("SDZ_AGENT_SETTING_OVERRIDE")
	if path == "" {
		return setting
	}
	raw, err := os.ReadFile(path)
	if err != nil {
		return setting
	}
	var o struct {
		Parameters map[string]string `json:"Parameters"`
		Queries    map[string]string `json:"Queries"`
	}
	if err := json.Unmarshal(raw, &o); err != nil {
		s.logger.Error("SETTING OVERRIDE FAILED", err.Error())
		return setting
	}
	for k, v := range o.Parameters {
		found := false
		for i := range setting.Parameters {
			if setting.Parameters[i].Key == k {
				setting.Parameters[i].Value = v
				found = true
			}
		}
		if !found {
			setting.Parameters = append(setting.Parameters, Parameter{Key: k, Value: v})
		}
	}
	for entity, cmd := range o.Queries {
		for i := range setting.Queries {
			if setting.Queries[i].Entity == entity {
				setting.Queries[i].Command = cmd
			}
		}
	}
	s.logger.Warnf("SETTING OVERRIDE APPLIED FROM %s", path)
	return setting
}

func (s *Service) SendResource(ctx context.Context, resource string, data any) error {
	tries := 1
	for {
		s.logger.Infof("TRYING(%d) TO SEND RESOURCE %s%s", tries, s.env.APIURL(), resource)
		_, err := s.http.Post(ctx, s.env.APIURL()+resource, data, s.Headers(), s.env.APIRequestTimeout())
		if err == nil {
			return nil
		}
		desc := err.Error()
		if re := core.AsRequestError(err); re != nil {
			desc = re.Describe()
		}
		s.logger.Errorf("TRYING(%d) TO SEND RESOURCE %s%s - %s", tries, s.env.APIURL(), resource, desc)
		if tries <= s.env.Retries() {
			s.utils.WaitCtx(ctx.Done(), core.CalculateRetryTime(tries, 60_000))
			tries++
			s.recorder.RecordRetry()
			if ctx.Err() != nil {
				return ctx.Err()
			}
			continue
		}
		return err
	}
}

func (s *Service) TouchSetting(ctx context.Context) {
	s.logger.Infof("TOUCH SETTING %ssettings", s.env.APIURL())
	if _, err := s.http.Patch(ctx, s.env.APIURL()+"settings", map[string]any{}, s.Headers(), s.env.APIRequestTimeout()); err != nil {
		desc := err.Error()
		if re := core.AsRequestError(err); re != nil {
			desc = re.Describe()
		}
		s.logger.Errorf("TOUCH SETTING %ssettings - %s", s.env.APIURL(), desc)
	}
}

func (s *Service) EnableFileLogging() { s.fileLog.Enable() }

// SendLog ships [level, timestamp, message...] pages to /logs with the base credentials (tagged [SND] when redirected).
func (s *Service) SendLog(ctx context.Context, page [][]string) bool {
	s.fileLog.Write(page)
	if s.env.BaseAPIURL() == "" || s.env.BaseClientID() == "" {
		return true // not configured: nothing to ship, nothing to keep
	}
	payload := page
	if s.env.IsRedirected() {
		payload = make([][]string, 0, len(page))
		for _, entry := range page {
			copyEntry := append([]string(nil), entry...)
			if len(copyEntry) > 2 {
				copyEntry[2] = "[SND] - " + copyEntry[2]
			}
			payload = append(payload, copyEntry)
		}
	}
	for attempt := 1; ; attempt++ {
		_, err := s.http.Post(ctx, s.env.BaseAPIURL()+"logs", payload, s.logHeaders(), s.env.APIRequestTimeout())
		if err == nil {
			return true
		}
		re := core.AsRequestError(err)
		if re != nil && re.StatusCode == 0 && attempt < 3 {
			time.Sleep(time.Duration(500*attempt) * time.Millisecond)
			continue
		}
		detail := err.Error()
		if re != nil && re.Body != "" {
			detail = re.Body
		}
		s.logger.LogLocal("error", fmt.Sprintf("ERROR %slogs %s", s.env.BaseAPIURL(), detail))
		return false
	}
}
