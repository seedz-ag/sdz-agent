using System.Text.Json.Nodes;
using MongoDB.Bson;
using MongoDB.Driver;
using Sdz.Agent.Core;
using Sdz.Agent.Core.Logging;

namespace Sdz.Agent.Data.Drivers;

/// <summary>
/// The "query" for MongoDB is a JSON document:
/// {"collection":"x","command":"find","find":{...filter...}} or
/// {"collection":"x","command":"aggregate","aggregate":[...pipeline...]}.
/// </summary>
public sealed class MongoDbDriver : IDatabaseAdapter
{
    private readonly DatabaseConfig _config;
    private readonly Logger _logger;
    private MongoClient? _client;

    public MongoDbDriver(DatabaseConfig config, Logger logger)
    {
        _config = config;
        _logger = logger;
    }

    public Task ConnectAsync(CancellationToken ct = default)
    {
        if (_client is not null) return Task.CompletedTask;
        try
        {
            var user = Uri.EscapeDataString(_config.Username ?? "");
            var pass = Uri.EscapeDataString(_config.Password ?? "");
            var uri = _config.Port is { } port
                ? $"mongodb://{user}:{pass}@{_config.Host}:{port}/?maxPoolSize=1&w=majority"
                : $"mongodb+srv://{user}:{pass}@{_config.Host}/?maxPoolSize=1&w=majority";
            _client = new MongoClient(uri);
        }
        catch (Exception e)
        {
            _logger.Error("MONGODB CONNECT ERROR", e);
        }
        return Task.CompletedTask;
    }

    public Task DisconnectAsync(CancellationToken ct = default)
    {
        try { _client?.Dispose(); }
        catch (Exception e) { _logger.Error("MONGODB CLOSE ERROR", e); }
        _client = null;
        return Task.CompletedTask;
    }

    public async Task<List<Row>> ExecuteAsync(string query, CancellationToken ct = default)
    {
        if (_client is null) await ConnectAsync(ct).ConfigureAwait(false);
        try
        {
            return await RunAsync(query, ct).ConfigureAwait(false);
        }
        catch (Exception e)
        {
            _logger.Error("MONGODB EXECUTE ERROR", query, e);
            return new List<Row>();
        }
    }

    public async Task<object> ExecuteQueryRemoteAsync(string query, CancellationToken ct = default)
    {
        if (_client is null) await ConnectAsync(ct).ConfigureAwait(false);
        try
        {
            return await RunAsync(query, ct).ConfigureAwait(false);
        }
        catch (Exception e)
        {
            _logger.Error("MONGODB EXECUTE REMOTE ERROR", query, e);
            return e.Message;
        }
    }

    public Task<string> GetVersionAsync(CancellationToken ct = default) => Task.FromResult("");

    public Task<List<Row>> QueryAsync(string query, int? page, int? limit, CancellationToken ct = default) =>
        ExecuteAsync(
            query.Replace(":skip", ((page ?? 0) * (limit ?? 1)).ToString())
                 .Replace(":limit", (limit ?? 1000).ToString()),
            ct);

    private async Task<List<Row>> RunAsync(string query, CancellationToken ct)
    {
        if (_client is null) throw new InvalidOperationException("MONGODB NOT CONNECTED");

        var input = Json.Parse(query) as JsonObject ?? throw new InvalidOperationException("INVALID MONGODB QUERY");
        var collectionName = input["collection"]?.GetValue<string>() ?? throw new InvalidOperationException("collection IS REQUIRED");
        var command = input["command"]?.GetValue<string>() ?? "find";
        var argument = input[command];

        var collection = _client.GetDatabase(_config.Schema).GetCollection<BsonDocument>(collectionName);
        List<BsonDocument> documents;

        switch (command.ToLowerInvariant())
        {
            case "find":
                var filter = argument is null ? new BsonDocument() : BsonDocument.Parse(argument.ToJsonString());
                documents = await collection.Find(filter).ToListAsync(ct).ConfigureAwait(false);
                break;
            case "aggregate":
                var stages = argument is JsonArray arr
                    ? arr.Select(s => BsonDocument.Parse(s!.ToJsonString())).ToList()
                    : new List<BsonDocument>();
                var pipeline = PipelineDefinition<BsonDocument, BsonDocument>.Create(stages);
                documents = await collection.Aggregate(pipeline, cancellationToken: ct).ToListAsync(ct).ConfigureAwait(false);
                break;
            default:
                throw new NotSupportedException($"MONGODB COMMAND NOT SUPPORTED: {command}");
        }

        return documents.Select(ToRow).ToList();
    }

    private static Row ToRow(BsonDocument document)
    {
        var row = new Row(document.ElementCount);
        foreach (var element in document) row[element.Name] = ToClr(element.Value);
        return row;
    }

    private static object? ToClr(BsonValue value) => value.BsonType switch
    {
        BsonType.Null or BsonType.Undefined => null,
        BsonType.Document => ToRow(value.AsBsonDocument),
        BsonType.Array => value.AsBsonArray.Select(ToClr).ToList(),
        BsonType.ObjectId => value.AsObjectId.ToString(),
        BsonType.DateTime => value.ToUniversalTime(),
        BsonType.Decimal128 => (decimal)value.AsDecimal128,
        BsonType.Int32 => value.AsInt32,
        BsonType.Int64 => value.AsInt64,
        BsonType.Double => value.AsDouble,
        BsonType.Boolean => value.AsBoolean,
        BsonType.String => value.AsString,
        BsonType.Binary => value.AsBsonBinaryData.Bytes,
        _ => value.ToString(),
    };

    public async ValueTask DisposeAsync()
    {
        await DisconnectAsync().ConfigureAwait(false);
        GC.SuppressFinalize(this);
    }
}
