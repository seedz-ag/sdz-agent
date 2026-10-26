package drivers

import (
	"context"
	"encoding/json"
	"fmt"
	"net/url"
	"strconv"
	"strings"
	"time"

	"github.com/seedz-ag/sdz-agent-go/internal/api"
	"github.com/seedz-ag/sdz-agent-go/internal/core"
	"github.com/seedz-ag/sdz-agent-go/internal/data"
	"go.mongodb.org/mongo-driver/v2/bson"
	"go.mongodb.org/mongo-driver/v2/mongo"
	"go.mongodb.org/mongo-driver/v2/mongo/options"
)

// mongoDriver: the "query" is a JSON document
// {"collection":"x","command":"find","find":{...filter...}} or
// {"collection":"x","command":"aggregate","aggregate":[...pipeline...]}.
type mongoDriver struct {
	cfg    data.Config
	logger *core.Logger
	client *mongo.Client
}

func newMongo(cfg data.Config, logger *core.Logger) data.Adapter {
	return &mongoDriver{cfg: cfg, logger: logger}
}

func (d *mongoDriver) BuildQuery(string, []api.Parameter) (string, bool) { return "", false }
func (d *mongoDriver) CheckConnection(context.Context) (bool, bool)      { return false, false }

func (d *mongoDriver) uri() string {
	user := url.QueryEscape(d.cfg.Username)
	pass := url.QueryEscape(d.cfg.Password)
	if d.cfg.Port != 0 {
		return fmt.Sprintf("mongodb://%s:%s@%s:%d/?maxPoolSize=1&w=majority", user, pass, d.cfg.Host, d.cfg.Port)
	}
	return fmt.Sprintf("mongodb+srv://%s:%s@%s/?maxPoolSize=1&w=majority", user, pass, d.cfg.Host)
}

func (d *mongoDriver) Connect(ctx context.Context) error {
	if d.client != nil {
		return nil
	}
	client, err := mongo.Connect(options.Client().ApplyURI(d.uri()).SetConnectTimeout(60 * time.Second))
	if err == nil {
		err = client.Ping(ctx, nil)
	}
	if err != nil {
		d.logger.Error("MONGODB CONNECT ERROR", err)
		if client != nil {
			_ = client.Disconnect(ctx)
		}
		return err
	}
	d.client = client
	return nil
}

func (d *mongoDriver) Disconnect(ctx context.Context) error {
	if d.client == nil {
		return nil
	}
	err := d.client.Disconnect(ctx)
	if err != nil {
		d.logger.Error("MONGODB CLOSE ERROR", err)
	}
	d.client = nil
	return err
}

func (d *mongoDriver) Execute(ctx context.Context, query string) ([]*core.Row, error) {
	rows, err := d.run(ctx, query)
	if err != nil {
		d.logger.Error("MONGODB EXECUTE ERROR", query, err)
		return []*core.Row{}, nil
	}
	return rows, nil
}

func (d *mongoDriver) ExecuteQueryRemote(ctx context.Context, query string) (any, error) {
	rows, err := d.run(ctx, query)
	if err != nil {
		d.logger.Error("MONGODB EXECUTE REMOTE ERROR", query, err)
		return err.Error(), nil
	}
	return rows, nil
}

func (d *mongoDriver) GetVersion(context.Context) (string, error) { return "", nil }

// Query replaces ":skip"/":limit" textually before parsing (the stored query may be `{"$skip"::skip}`).
func (d *mongoDriver) Query(ctx context.Context, query string, page *int, limit int) ([]*core.Row, error) {
	p := 0
	if page != nil {
		p = *page
	}
	l := limit
	if l <= 0 {
		l = 1000
	}
	skip := p
	if limit > 0 {
		skip = p * limit
	}
	query = strings.ReplaceAll(query, ":skip", strconv.Itoa(skip))
	query = strings.ReplaceAll(query, ":limit", strconv.Itoa(l))
	return d.Execute(ctx, query)
}

func (d *mongoDriver) run(ctx context.Context, query string) ([]*core.Row, error) {
	if d.client == nil {
		if err := d.Connect(ctx); err != nil {
			return nil, err
		}
	}
	var input map[string]json.RawMessage
	if err := json.Unmarshal([]byte(query), &input); err != nil {
		return nil, fmt.Errorf("INVALID MONGODB QUERY: %w", err)
	}
	var collectionName string
	if raw, ok := input["collection"]; ok {
		_ = json.Unmarshal(raw, &collectionName)
	}
	if collectionName == "" {
		return nil, fmt.Errorf("collection IS REQUIRED")
	}
	command := "find"
	if raw, ok := input["command"]; ok {
		_ = json.Unmarshal(raw, &command)
	}
	collection := d.client.Database(d.cfg.Schema).Collection(collectionName)

	var cursor *mongo.Cursor
	var err error
	switch strings.ToLower(command) {
	case "find":
		filter := bson.D{}
		if raw, ok := input[command]; ok && len(raw) > 0 {
			if err := bson.UnmarshalExtJSON(raw, false, &filter); err != nil {
				return nil, fmt.Errorf("INVALID FIND FILTER: %w", err)
			}
		}
		cursor, err = collection.Find(ctx, filter)
	case "aggregate":
		pipeline := []bson.D{}
		if raw, ok := input[command]; ok && len(raw) > 0 {
			var stages []json.RawMessage
			if err := json.Unmarshal(raw, &stages); err != nil {
				return nil, fmt.Errorf("INVALID AGGREGATE PIPELINE: %w", err)
			}
			for _, s := range stages {
				var stage bson.D
				if err := bson.UnmarshalExtJSON(s, false, &stage); err != nil {
					return nil, fmt.Errorf("INVALID AGGREGATE STAGE: %w", err)
				}
				pipeline = append(pipeline, stage)
			}
		}
		cursor, err = collection.Aggregate(ctx, pipeline)
	default:
		return nil, fmt.Errorf("MONGODB COMMAND NOT SUPPORTED: %s", command)
	}
	if err != nil {
		return nil, err
	}
	defer cursor.Close(ctx)

	out := []*core.Row{}
	for cursor.Next(ctx) {
		var doc bson.D
		if err := cursor.Decode(&doc); err != nil {
			return nil, err
		}
		out = append(out, bsonToRow(doc))
	}
	return out, cursor.Err()
}

func bsonToRow(doc bson.D) *core.Row {
	row := core.NewRow()
	for _, e := range doc {
		row.Set(e.Key, bsonToValue(e.Value))
	}
	return row
}

func bsonToValue(v any) any {
	switch t := v.(type) {
	case nil:
		return nil
	case bson.D:
		return bsonToRow(t)
	case bson.M:
		row := core.NewRow()
		for k, val := range t {
			row.Set(k, bsonToValue(val))
		}
		return row
	case bson.A:
		out := make([]any, 0, len(t))
		for _, x := range t {
			out = append(out, bsonToValue(x))
		}
		return out
	case []any:
		out := make([]any, 0, len(t))
		for _, x := range t {
			out = append(out, bsonToValue(x))
		}
		return out
	case bson.ObjectID:
		return t.Hex()
	case bson.DateTime:
		return core.UTCTime(t.Time().UTC())
	case bson.Decimal128:
		return json.Number(core.NormalizeNumber(t.String()))
	case bson.Binary:
		return t.Data
	case bson.Null, bson.Undefined:
		return nil
	case int32:
		return int64(t)
	case int64, float64, bool, string:
		return t
	default:
		return fmt.Sprintf("%v", t)
	}
}
