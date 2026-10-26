package consumers

import (
	"bytes"
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"os"
	"strconv"
	"strings"
	"sync"

	"github.com/seedz-ag/sdz-agent-go/internal/api"
	"github.com/seedz-ag/sdz-agent-go/internal/core"
	"github.com/seedz-ag/sdz-agent-go/internal/services"
	"github.com/seedz-ag/sdz-agent-go/internal/transports"
)

const streamBatchSize = 10_000

// HTTP is the port of HttpConsumer: each query Command is a JSON request recipe
// (url, method, headers, body, scope, dataPath, authentication, paginates, range, useStream).
type HTTP struct {
	env           *core.Env
	paths         *core.Paths
	http          *core.HTTPClient
	hydrator      *services.Hydrator
	interpolation *services.Interpolation
	logger        *core.Logger
	utils         *core.Utils
	mu            sync.Mutex
	cache         map[string]int
	setting       *api.Setting
	transport     transports.Transport
}

func NewHTTP(env *core.Env, paths *core.Paths, http *core.HTTPClient, h *services.Hydrator, i *services.Interpolation, logger *core.Logger, utils *core.Utils) *HTTP {
	return &HTTP{env: env, paths: paths, http: http, hydrator: h, interpolation: i, logger: logger, utils: utils, cache: map[string]int{}}
}

func (c *HTTP) SetSetting(s *api.Setting) Consumer           { c.setting = s; return c }
func (c *HTTP) SetTransport(t transports.Transport) Consumer { c.transport = t; return c }

func str(v any) string {
	if v == nil {
		return ""
	}
	return services.Stringify(v)
}

func rowGet(r *core.Row, key string) any {
	if r == nil {
		return nil
	}
	v, _ := r.Get(key)
	return v
}

func toFloat(v any) float64 {
	f, _ := strconv.ParseFloat(strings.TrimSpace(str(v)), 64)
	return f
}

func (c *HTTP) Consume(ctx context.Context) error {
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
		var queries []api.Query
		for _, q := range c.setting.Queries {
			if q.Entity == schema.Entity {
				queries = append(queries, q)
			}
		}
		if t := c.env.Type(); t == "all" || t == "datasource" {
			return nil
		}
		entity := strings.ToUpper(schema.Entity)
		c.logger.Infof("HTTP REQUEST FOUND: %s", entity)
		if len(queries) == 0 {
			c.logger.Errorf("COULDN'T FIND QUERY COMMAND %s", entity)
			return fmt.Errorf("COULDN'T FIND QUERY COMMAND %s", entity)
		}
		c.logger.Infof("CONSUMING %s", entity)

		for _, query := range queries {
			if err := c.consumeQuery(ctx, schema, query); err != nil {
				c.logger.Errorf("CONSUMING %s", entity)
				c.logger.Error("HTTP CONSUMER ERROR", err.Error())
			}
		}
	}
	return nil
}

func (c *HTTP) consumeQuery(ctx context.Context, schema api.Schema, query api.Query) error {
	parsed, err := core.ParseJSON([]byte(query.Command))
	if err != nil {
		return err
	}
	command, ok := parsed.(*core.Row)
	if !ok {
		return errors.New("QUERY COMMAND IS NOT A JSON OBJECT")
	}
	c.interpolation.SetPage(0)
	_ = os.MkdirAll(c.paths.OutputDir(), 0o750)
	_ = os.WriteFile(c.paths.Output(fmt.Sprintf("%s-%s.json", strings.ToLower(schema.Entity), query.ID)), []byte(query.Command), 0o640)

	if err := handleRange(command); err != nil {
		return err
	}
	rng, _ := rowGet(command, "range").(*core.Row)
	paginates := core.Truthy(rowGet(command, "paginates"))
	isPagePagination := paginates && rng == nil
	if isPagePagination {
		sc, _ := rowGet(command, "scope").(*core.Row)
		if sc == nil {
			sc = core.NewRow()
			command.Set("scope", sc)
		}
		if _, ok := sc.Get("page"); !ok {
			sc.Set("page", json.Number("1"))
		}
	}

	response, err := c.request(ctx, schema, command, 1)
	if err != nil {
		return err
	}
	if isPagePagination {
		for len(response) > 0 {
			if ctx.Err() != nil {
				return ctx.Err()
			}
			sc := rowGet(command, "scope").(*core.Row)
			current := int(toFloat(rowGet(sc, "page")))
			if current == 0 {
				current = 1
			}
			sc.Set("page", json.Number(strconv.Itoa(current+1)))
			next, err := c.request(ctx, schema, command, 1)
			if err != nil {
				return err
			}
			if len(next) == 0 {
				break
			}
			response = next
		}
	} else if rng != nil || (len(response) > 0 && paginates) {
		for (len(response) > 0 && paginates) || rng != nil {
			if ctx.Err() != nil {
				return ctx.Err()
			}
			if rng != nil {
				cur, _ := rowGet(rng, "current").(*core.Row)
				if str(rowGet(cur, "value")) == str(rowGet(rng, "stop")) {
					break
				}
			}
			if err := handleRange(command); err != nil {
				return err
			}
			if response, err = c.request(ctx, schema, command, 1); err != nil {
				return err
			}
		}
	}
	return nil
}

// handleRange exposes current/end in scope and steps the counters (port of handleRange).
func handleRange(command *core.Row) error {
	rng, ok := rowGet(command, "range").(*core.Row)
	if !ok || rng == nil {
		return nil
	}
	sc, _ := rowGet(command, "scope").(*core.Row)
	if sc == nil {
		sc = core.NewRow()
		command.Set("scope", sc)
	}
	for _, dir := range []string{"current", "end"} {
		bound, _ := rowGet(rng, dir).(*core.Row)
		v := rowGet(bound, "value")
		if v == nil {
			sc.Set(dir, "undefined")
		} else {
			sc.Set(dir, str(v))
		}
	}
	for _, dir := range []string{"current", "end"} {
		bound, _ := rowGet(rng, dir).(*core.Row)
		if bound == nil {
			continue
		}
		typ := str(rowGet(bound, "type"))
		if typ == "" {
			continue
		}
		value, step := toFloat(rowGet(bound, "value")), toFloat(rowGet(bound, "step"))
		switch typ {
		case "INT_DECREMENT":
			bound.Set("value", json.Number(strconv.FormatFloat(value-step, 'f', -1, 64)))
		case "INT_INCREMENT":
			bound.Set("value", json.Number(strconv.FormatFloat(value+step, 'f', -1, 64)))
		default:
			return errors.New("INVALID STEP TYPE")
		}
	}
	return nil
}

func (c *HTTP) getResourceName(schema api.Schema) string {
	if schema.InputFormat == "JSON" {
		return schema.APIResource
	}
	for _, s := range c.setting.Schemas {
		if s.InputFormat == "JSON" && s.APIResource == schema.Entity {
			return s.APIResource
		}
	}
	if schema.APIResource != "" {
		return schema.APIResource
	}
	return schema.Entity
}

func toScope(v any) map[string]any {
	out := map[string]any{}
	if r, ok := v.(*core.Row); ok {
		for _, k := range r.Keys() {
			out[k], _ = r.Get(k)
		}
	}
	return out
}

func (c *HTTP) compile(template string, scope map[string]any) string {
	return c.interpolation.Interpolate(template, nil, scope)
}

func (c *HTTP) request(ctx context.Context, schema api.Schema, req *core.Row, tries int) ([]any, error) {
	body := rowGet(req, "body")
	dataPath := str(rowGet(req, "dataPath"))
	headers, _ := rowGet(req, "headers").(*core.Row)
	method := str(rowGet(req, "method"))
	if method == "" {
		method = "GET"
	}
	scope := toScope(rowGet(req, "scope"))
	timeout := int(toFloat(rowGet(req, "timeout")))
	url := str(rowGet(req, "url"))

	c.logger.Info("GETTING RESOURCE")
	resource := c.getResourceName(schema)

	if auth, ok := rowGet(req, "authentication").(*core.Row); ok && auth != nil {
		token, err := c.authenticate(ctx, auth, headers)
		if err != nil {
			return nil, err
		}
		scope["Authorization"] = token
	}
	c.logger.Infof("RUNNING EXTRACTION FOR RESOURCE: %s", resource)

	var compiledHeaders map[string]string
	if headers != nil {
		compiledHeaders = parseHeaders(c.compile(core.MustJSON(headers), scope))
	}
	var data any
	if body != nil {
		data = c.compileBody(compiledHeaders, body, scope)
	}
	compiled := core.Request{URL: c.compile(url, scope), Method: method, Data: data, Headers: compiledHeaders, Timeout: timeout}
	compiledJSON := core.MustJSON(map[string]any{"data": data, "headers": compiledHeaders, "method": method, "timeout": timeout, "url": compiled.URL})
	c.logger.Info("REQUESTING", compiledJSON)

	key := strings.ToUpper(schema.Entity)
	c.mu.Lock()
	c.cache[key]++
	n := c.cache[key]
	c.mu.Unlock()
	_ = os.WriteFile(c.paths.Output(fmt.Sprintf("%s-request-%05d.json", strings.ToLower(schema.Entity), n)), []byte(compiledJSON), 0o640)

	if core.Truthy(rowGet(req, "useStream")) {
		c.logger.Infof("USING STREAM MODE FOR %s", resource)
		return c.requestWithStream(ctx, schema, compiled, resource, tries)
	}

	resp, err := c.http.Do(ctx, compiled)
	var response any
	if err == nil {
		response = parseBody(resp, compiledHeaders)
		if dataPath != "" {
			response = c.searchDataPath(response, dataPath)
		}
	}
	if err != nil {
		detail := err.Error()
		if re := core.AsRequestError(err); re != nil {
			detail = re.Describe()
		}
		c.logger.Errorf("TRYING(%d) TO REQUESTING %s[%s]", tries, resource, detail)
		if tries <= c.env.Retries() {
			c.utils.WaitCtx(ctx.Done(), core.CalculateRetryTime(tries, 30_000))
			if ctx.Err() != nil {
				return nil, ctx.Err()
			}
			return c.request(ctx, schema, req, tries+1)
		}
		return nil, err
	}

	list := c.normalize(response, resource)
	if len(list) == 0 {
		return list, nil
	}
	if needsToHydrate(schema) {
		c.logger.Infof("DATA FOR: %s WILL BE TRANFORMED USING SCHEMA MAPS", strings.ToUpper(schema.Entity))
	}
	hydrated := c.applyHydration(list, schema)
	if _, err := c.sendResults(ctx, hydrated, list, resource); err != nil {
		return nil, err
	}
	return list, nil
}

func (c *HTTP) authenticate(ctx context.Context, auth, headers *core.Row) (string, error) {
	c.logger.Info("STARTING AUTHENTICATION")
	username := str(rowGet(auth, "username"))
	usernameKey := str(rowGet(auth, "usernameKey"))
	if usernameKey == "" {
		usernameKey = "username"
	}
	password := str(rowGet(auth, "password"))
	passwordKey := str(rowGet(auth, "passwordKey"))
	if passwordKey == "" {
		passwordKey = "password"
	}
	url := str(rowGet(auth, "url"))
	path := str(rowGet(auth, "path"))
	method := str(rowGet(auth, "method"))
	if method == "" {
		method = "POST"
	}
	tokenType := str(rowGet(auth, "tokenType"))

	var reqHeaders map[string]string
	if headers != nil {
		for _, k := range headers.Keys() {
			if strings.EqualFold(k, "INSECURE") {
				reqHeaders = map[string]string{k: str(rowGet(headers, k))}
			}
		}
	}
	c.logger.Infof("AUTHENTICATING TO: %s", url)
	payload := core.NewRow()
	payload.Set(usernameKey, username)
	payload.Set(passwordKey, password)
	resp, err := c.http.Do(ctx, core.Request{URL: url, Method: method, Headers: reqHeaders, Data: payload})
	if err != nil {
		c.logger.Errorf("AUTHENTICATION FAILED: %s", err.Error())
		return "", err
	}
	data := parseBody(resp, nil)
	var token any = data
	if path != "" {
		token = services.Get(data, path, nil)
	}
	c.logger.Info("AUTHENTICATION SUCCESSFUL")
	text := str(token)
	if tokenType == "" {
		return text, nil
	}
	return tokenType + text, nil
}

func (c *HTTP) requestWithStream(ctx context.Context, schema api.Schema, compiled core.Request, resource string, tries int) ([]any, error) {
	body, resp, err := c.http.Stream(ctx, compiled)
	var results []any
	if err == nil {
		count := 0
		err = streamEntries(body, func(row *core.Row) error {
			count++
			results = append(results, row)
			if count%100 == 0 {
				c.logger.Infof("Processados %d entries via stream", count)
			}
			return nil
		})
		body.Close()
		_ = resp
	}
	if err != nil {
		detail := err.Error()
		if re := core.AsRequestError(err); re != nil {
			detail = re.Describe()
		}
		c.logger.Errorf("TRYING(%d) TO REQUESTING %s[%s]", tries, resource, detail)
		if tries <= c.env.Retries() {
			c.utils.WaitCtx(ctx.Done(), core.CalculateRetryTime(tries, 30_000))
			if ctx.Err() != nil {
				return nil, ctx.Err()
			}
			return c.requestWithStream(ctx, schema, compiled, resource, tries+1)
		}
		return nil, err
	}
	c.logger.Infof("Stream concluído: %d itens processados", len(results))
	if len(results) == 0 {
		c.logger.Infof("EMPTY: %s", resource)
		return results, nil
	}
	var all []any
	for start := 0; start < len(results); start += streamBatchSize {
		end := start + streamBatchSize
		if end > len(results) {
			end = len(results)
		}
		batchRaw := results[start:end]
		batchHydrated := c.applyHydration(batchRaw, schema)
		all = append(all, batchHydrated...)
		c.utils.WaitCtx(ctx.Done(), c.env.Throttle())
		if _, err := c.sendResults(ctx, batchHydrated, batchRaw, resource); err != nil {
			return nil, err
		}
	}
	return all, nil
}

func (c *HTTP) applyHydration(list []any, schema api.Schema) []any {
	if !needsToHydrate(schema) {
		return list
	}
	out := make([]any, len(list))
	for i, item := range list {
		if row, ok := item.(*core.Row); ok {
			out[i] = c.hydrator.Hydrate(schema.Maps, row)
		} else {
			out[i] = item
		}
	}
	return out
}

// sendResults ships raw + hydrated data; returns true when RAW_ONLY short-circuited.
func (c *HTTP) sendResults(ctx context.Context, hydrated, raw []any, resource string) (bool, error) {
	if c.setting.Channel != "SAAS_S3" {
		var wg sync.WaitGroup
		wg.Add(1)
		go func() { defer wg.Done(); c.utils.WriteJSON("raw-"+resource, raw, false) }()
		err := c.transport.Send(ctx, "raw/"+resource, raw)
		wg.Wait()
		if err != nil {
			return false, err
		}
		c.utils.WaitCtx(ctx.Done(), c.env.Throttle())
		if c.env.RawOnly() && !strings.HasPrefix(resource, "raw") {
			c.logger.Warn("SENDING EXTRACTION TO RAW ONLY")
			return true, nil
		}
	}
	var wg sync.WaitGroup
	wg.Add(1)
	go func() { defer wg.Done(); c.utils.WriteJSON(resource, hydrated, false) }()
	err := c.transport.Send(ctx, resource, hydrated)
	wg.Wait()
	if err != nil {
		return false, err
	}
	c.utils.WaitCtx(ctx.Done(), c.env.Throttle())
	return false, nil
}

func (c *HTTP) searchDataPath(data any, path string) any {
	c.logger.Info("SEARCH DATA PATH")
	tokens := strings.Split(path, ".")
	current := data
	for i := 0; i < len(tokens) && current != nil; i++ {
		key := tokens[i]
		if key == "*" && i+1 < len(tokens) {
			current = services.Get(current, "*."+tokens[i+1], nil)
			i++
		} else {
			current = services.Get(current, key, nil)
		}
	}
	if current != nil {
		items, ok := current.([]any)
		if !ok {
			items = []any{current}
		}
		out := make([]any, len(items))
		for i, item := range items {
			if row, ok := item.(*core.Row); ok {
				up := core.NewRow()
				for _, k := range row.Keys() {
					v, _ := row.Get(k)
					up.Set(strings.ToUpper(k), v)
				}
				out[i] = up
			} else {
				out[i] = item
			}
		}
		current = out
	}
	c.logger.Info("DATA PATH FOUND")
	if current == nil {
		return ""
	}
	return current
}

func (c *HTTP) normalize(response any, resource string) []any {
	switch t := response.(type) {
	case []any:
		if len(t) == 0 {
			c.logger.Infof("EMPTY: %s", resource)
		}
		return t
	case *core.Row:
		if t.Len() == 0 {
			c.logger.Infof("EMPTY: %s", resource)
			return nil
		}
		return []any{t}
	case nil:
		c.logger.Infof("EMPTY: %s", resource)
		return nil
	case string:
		if t == "" {
			c.logger.Infof("EMPTY: %s", resource)
			return nil
		}
		return []any{t}
	default:
		return []any{t}
	}
}

func parseBody(resp *core.Response, headers map[string]string) any {
	body := bytes.TrimSpace(resp.Body)
	if len(body) == 0 {
		return nil
	}
	accept := ""
	for k, v := range headers {
		if strings.EqualFold(k, "Accept") {
			accept = v
		}
	}
	ct := strings.ToLower(resp.ContentType())
	if accept == "application/xml" || (strings.Contains(ct, "xml") && body[0] == '<') {
		if row, err := xmlToJSON(body); err == nil {
			return row
		}
		return string(body)
	}
	if v, err := core.ParseJSON(body); err == nil {
		return v
	}
	return string(body)
}

func (c *HTTP) compileBody(headers map[string]string, body any, scope map[string]any) any {
	c.logger.Info("COMPILE BODY")
	contentType := ""
	for k, v := range headers {
		if strings.EqualFold(k, "Content-Type") {
			contentType = v
		}
	}
	text, isString := body.(string)
	if !isString {
		v, err := core.ParseJSON([]byte(c.compile(core.MustJSON(body), scope)))
		if err != nil {
			return body
		}
		return v
	}
	if strings.HasPrefix(strings.ToLower(contentType), "application/json") {
		v, err := core.ParseJSON([]byte(c.compile(text, scope)))
		if err != nil {
			return c.compile(text, scope)
		}
		return v
	}
	return c.compile(text, scope)
}

func parseHeaders(jsonText string) map[string]string {
	out := map[string]string{}
	v, err := core.ParseJSON([]byte(jsonText))
	if err != nil {
		return out
	}
	if row, ok := v.(*core.Row); ok {
		for _, k := range row.Keys() {
			x, _ := row.Get(k)
			out[k] = str(x)
		}
	}
	return out
}
