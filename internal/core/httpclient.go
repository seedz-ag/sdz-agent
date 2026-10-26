package core

import (
	"bytes"
	"context"
	"crypto/tls"
	"crypto/x509"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"net"
	"net/http"
	"strings"
	"sync"
	"time"

	"github.com/seedz-ag/sdz-agent-go/internal/telemetry"
)

// RequestError mirrors the axios error the Node agent inspected (status, statusText, data, code).
type RequestError struct {
	StatusCode int
	StatusText string
	Body       string
	Code       string
	Err        error
}

func (e *RequestError) Error() string {
	if e.StatusCode > 0 {
		return fmt.Sprintf("Request failed with status code %d", e.StatusCode)
	}
	if e.Err != nil {
		return e.Err.Error()
	}
	return "request failed"
}

func (e *RequestError) Unwrap() error { return e.Err }
func (e *RequestError) IsTimeout() bool {
	return e.Code == "ECONNABORTED" || e.Code == "ETIMEDOUT"
}

// Describe is the port of APIService.formatRequestError.
func (e *RequestError) Describe() string {
	var parts []string
	if e.StatusCode > 0 {
		parts = append(parts, fmt.Sprintf("status=%d", e.StatusCode))
	}
	if e.StatusText != "" {
		parts = append(parts, "statusText="+e.StatusText)
	}
	if e.Code != "" {
		parts = append(parts, "code="+e.Code)
	}
	body := strings.TrimSpace(e.Body)
	if body != "" && body != "{}" {
		parts = append(parts, "data="+body)
	} else if e.Err != nil {
		parts = append(parts, "message="+e.Err.Error())
	}
	if len(parts) == 0 {
		return "unknown error"
	}
	return strings.Join(parts, " ")
}

func AsRequestError(err error) *RequestError {
	var re *RequestError
	if errors.As(err, &re) {
		return re
	}
	return nil
}

// Request describes one HTTP call (headers may carry INSECURE / Certificate-Authority conventions).
type Request struct {
	URL     string
	Method  string
	Data    any
	Headers map[string]string
	Timeout int // ms
}

type Response struct {
	Body       []byte
	Header     http.Header
	StatusCode int
}

func (r *Response) ContentType() string { return r.Header.Get("Content-Type") }

// HTTPClient is the port of HttpClientAdapter: per-request timeouts, optional
// insecure TLS or custom CA via headers, Connection: close like axios, telemetry hooks.
type HTTPClient struct {
	recorder  *telemetry.Recorder
	userAgent string
	mu        sync.Mutex
	clients   map[string]*http.Client
}

func NewHTTPClient(recorder *telemetry.Recorder) *HTTPClient {
	return &HTTPClient{recorder: recorder, userAgent: "sdz-agent/" + Version, clients: map[string]*http.Client{}}
}

func (c *HTTPClient) client(insecure bool, ca string) *http.Client {
	key := fmt.Sprintf("%v|%d", insecure, len(ca))
	c.mu.Lock()
	defer c.mu.Unlock()
	if cl, ok := c.clients[key]; ok {
		return cl
	}
	tlsCfg := &tls.Config{InsecureSkipVerify: insecure} //nolint:gosec // opt-in via the INSECURE header, as in the Node agent
	if !insecure && ca != "" {
		pool, _ := x509.SystemCertPool()
		if pool == nil {
			pool = x509.NewCertPool()
		}
		pool.AppendCertsFromPEM([]byte(ca))
		tlsCfg.RootCAs = pool
	}
	transport := &http.Transport{
		Proxy:               http.ProxyFromEnvironment,
		DialContext:         (&net.Dialer{Timeout: 30 * time.Second}).DialContext,
		TLSClientConfig:     tlsCfg,
		DisableKeepAlives:   true, // one connection per request (axios without keep-alive)
		TLSHandshakeTimeout: 30 * time.Second,
	}
	cl := &http.Client{Transport: transport}
	c.clients[key] = cl
	return cl
}

func (c *HTTPClient) Get(ctx context.Context, url string, headers map[string]string, timeout int) (*Response, error) {
	return c.Do(ctx, Request{URL: url, Method: "GET", Headers: headers, Timeout: timeout})
}

func (c *HTTPClient) Post(ctx context.Context, url string, payload any, headers map[string]string, timeout int) (*Response, error) {
	return c.Do(ctx, Request{URL: url, Method: "POST", Data: payload, Headers: headers, Timeout: timeout})
}

func (c *HTTPClient) Patch(ctx context.Context, url string, payload any, headers map[string]string, timeout int) (*Response, error) {
	return c.Do(ctx, Request{URL: url, Method: "PATCH", Data: payload, Headers: headers, Timeout: timeout})
}

// Do executes the request and reads the whole body. Non-2xx → *RequestError.
func (c *HTTPClient) Do(ctx context.Context, req Request) (*Response, error) {
	resp, err := c.execute(ctx, req)
	if err != nil {
		return nil, err
	}
	defer resp.Body.Close()
	body, err := io.ReadAll(resp.Body)
	if err != nil {
		return nil, &RequestError{Err: err, Code: "ECONNRESET"}
	}
	return &Response{Body: body, Header: resp.Header, StatusCode: resp.StatusCode}, nil
}

// Stream executes the request and returns the open body (listen channel, XML stream mode).
func (c *HTTPClient) Stream(ctx context.Context, req Request) (io.ReadCloser, *http.Response, error) {
	resp, err := c.execute(ctx, req)
	if err != nil {
		return nil, nil, err
	}
	return resp.Body, resp, nil
}

func (c *HTTPClient) execute(ctx context.Context, req Request) (*http.Response, error) {
	headers := req.Headers
	insecure, ca := false, ""
	for k, v := range headers {
		if strings.EqualFold(k, "INSECURE") {
			insecure = true
		}
		if k == "Certificate-Authority" {
			ca = v
		}
	}
	method := strings.ToUpper(req.Method)
	if method == "" {
		method = "GET"
	}
	var body io.Reader
	contentType := ""
	for k, v := range headers {
		if strings.EqualFold(k, "Content-Type") {
			contentType = v
		}
	}
	if req.Data != nil && method != "GET" && method != "HEAD" {
		switch d := req.Data.(type) {
		case []byte:
			body = bytes.NewReader(d)
			if contentType == "" {
				contentType = "application/octet-stream"
			}
		case string:
			body = strings.NewReader(d)
			if contentType == "" {
				contentType = "text/plain; charset=utf-8"
			}
		case io.Reader:
			body = d
		default:
			b, err := MarshalJSON(d, false)
			if err != nil {
				return nil, &RequestError{Err: err}
			}
			body = bytes.NewReader(b)
			if contentType == "" {
				contentType = "application/json; charset=utf-8"
			}
		}
	}
	timeout := 300 * time.Second
	if req.Timeout > 0 {
		timeout = time.Duration(req.Timeout) * time.Millisecond
	}
	ctx, cancel := context.WithTimeout(ctx, timeout)
	httpReq, err := http.NewRequestWithContext(ctx, method, req.URL, body)
	if err != nil {
		cancel()
		return nil, &RequestError{Err: err, Code: "EINVAL"}
	}
	httpReq.Header.Set("User-Agent", c.userAgent)
	httpReq.Close = true
	for k, v := range headers {
		if k == "Certificate-Authority" || strings.EqualFold(k, "Content-Length") || strings.EqualFold(k, "Content-Type") {
			continue
		}
		httpReq.Header.Set(k, v)
	}
	if contentType != "" && body != nil {
		httpReq.Header.Set("Content-Type", contentType)
	}
	started := time.Now()
	resp, err := c.client(insecure, ca).Do(httpReq)
	elapsed := float64(time.Since(started).Milliseconds())
	if err != nil {
		cancel()
		code := "ECONNREFUSED"
		outcome := telemetry.OutcomeError
		if errors.Is(err, context.DeadlineExceeded) || strings.Contains(strings.ToLower(err.Error()), "timeout") {
			code = "ECONNABORTED"
			outcome = telemetry.OutcomeTimeout
		} else if strings.Contains(err.Error(), "no such host") {
			code = "ENOTFOUND"
		}
		c.recorder.RecordRequest(outcome, elapsed)
		return nil, &RequestError{Err: err, Code: code}
	}
	if resp.StatusCode < 200 || resp.StatusCode >= 300 {
		b, _ := io.ReadAll(io.LimitReader(resp.Body, 1<<20))
		resp.Body.Close()
		cancel()
		c.recorder.RecordRequest(telemetry.OutcomeError, elapsed)
		return nil, &RequestError{StatusCode: resp.StatusCode, StatusText: http.StatusText(resp.StatusCode), Body: string(b)}
	}
	c.recorder.RecordRequest(telemetry.OutcomeOK, elapsed)
	// the body owns the cancel: closing it releases the timeout context
	resp.Body = &cancelOnClose{ReadCloser: resp.Body, cancel: cancel}
	return resp, nil
}

type cancelOnClose struct {
	io.ReadCloser
	cancel context.CancelFunc
}

func (c *cancelOnClose) Close() error {
	err := c.ReadCloser.Close()
	c.cancel()
	return err
}

// DecodeJSON unmarshals a response body into v.
func (r *Response) DecodeJSON(v any) error {
	if len(bytes.TrimSpace(r.Body)) == 0 {
		return nil
	}
	return json.Unmarshal(r.Body, v)
}
