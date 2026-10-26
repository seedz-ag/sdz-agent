using System.Text.Json.Nodes;
using Sdz.Agent.Adapters;
using Sdz.Agent.Api;
using Sdz.Agent.Core;
using Sdz.Agent.Core.Http;
using Sdz.Agent.Core.Logging;
using Sdz.Agent.Services;
using Sdz.Agent.Transports;

namespace Sdz.Agent.Consumers;

/// <summary>
/// Port of HttpConsumer: each query Command is a JSON "request recipe"
/// (url, method, headers, body, scope, dataPath, authentication, paginates,
/// range, useStream) interpolated with the InterpolationService and executed
/// page by page. Raw and hydrated results are written to output/ and sent
/// through the transport.
/// </summary>
public sealed class HttpConsumer : IConsumer
{
    private const int StreamBatchSize = 10_000;

    private readonly AgentEnvironment _env;
    private readonly AgentPaths _paths;
    private readonly HttpClientAdapter _http;
    private readonly HydratorService _hydrator;
    private readonly InterpolationService _interpolation;
    private readonly Logger _logger;
    private readonly Utils _utils;
    private readonly Dictionary<string, int> _cache = new();
    private Setting _setting = new();
    private ITransport? _transport;

    public HttpConsumer(AgentEnvironment env, AgentPaths paths, HttpClientAdapter http, HydratorService hydrator,
        InterpolationService interpolation, Logger logger, Utils utils)
    {
        _env = env;
        _paths = paths;
        _http = http;
        _hydrator = hydrator;
        _interpolation = interpolation;
        _logger = logger;
        _utils = utils;
    }

    public IConsumer SetSetting(Setting setting) { _setting = setting; return this; }
    public IConsumer SetTransport(ITransport transport) { _transport = transport; return this; }

    // ---------------------------------------------------------------- consume

    public async Task ConsumeAsync(CancellationToken ct = default)
    {
        var scope = _env.Schema;

        foreach (var schema in _setting.Schemas)
        {
            ct.ThrowIfCancellationRequested();
            if (!string.IsNullOrEmpty(scope) && schema.Entity != scope) continue;
            if (schema.InputFormat != "AGENT" && Utils.HasAgentSchemaForCurrentEntity(_setting.Schemas, schema.Entity)) continue;

            var queries = _setting.Queries.Where(q => q.Entity == schema.Entity).ToList();

            if (_env.Type is "all" or "datasource") return;

            var entity = schema.Entity.ToUpperInvariant();
            _logger.Info($"HTTP REQUEST FOUND: {entity}");

            if (queries.Count == 0)
            {
                _logger.Error($"COULDN'T FIND QUERY COMMAND {entity}");
                throw new InvalidOperationException($"COULDN'T FIND QUERY COMMAND {entity}");
            }

            _logger.Info($"CONSUMING {entity}");

            foreach (var query in queries)
            {
                try
                {
                    var command = Json.Parse(query.Command) as JsonObject
                        ?? throw new InvalidOperationException("QUERY COMMAND IS NOT A JSON OBJECT");
                    _interpolation.SetPage(0);

                    try
                    {
                        Directory.CreateDirectory(_paths.OutputDir);
                        await File.WriteAllTextAsync(_paths.Output($"{schema.Entity.ToLowerInvariant()}-{query.Id}.json"), query.Command, ct).ConfigureAwait(false);
                    }
                    catch { }

                    HandleRange(command);

                    var range = command["range"] as JsonObject;
                    var paginates = Truthy(command["paginates"]);
                    var isPagePagination = paginates && range is null;

                    if (isPagePagination)
                    {
                        var commandScope = command["scope"] as JsonObject ?? new JsonObject();
                        command["scope"] = commandScope;
                        commandScope["page"] ??= 1;
                    }

                    var response = await RequestAsync(schema, command, 1, ct).ConfigureAwait(false);

                    if (isPagePagination)
                    {
                        while (response.Count > 0)
                        {
                            ct.ThrowIfCancellationRequested();
                            var commandScope = (JsonObject)command["scope"]!;
                            var current = commandScope["page"]?.GetValue<int>() ?? 1;
                            commandScope["page"] = current + 1;
                            var next = await RequestAsync(schema, command, 1, ct).ConfigureAwait(false);
                            if (next.Count == 0) break;
                            response = next;
                        }
                    }
                    else if (range is not null || (response.Count > 0 && paginates))
                    {
                        while ((response.Count > 0 && paginates) || range is not null)
                        {
                            ct.ThrowIfCancellationRequested();
                            if (range is not null && Str(range["current"]?["value"]) == Str(range["stop"])) break;
                            HandleRange(command);
                            response = await RequestAsync(schema, command, 1, ct).ConfigureAwait(false);
                        }
                    }
                }
                catch (Exception error)
                {
                    _logger.Error($"CONSUMING {entity}");
                    _logger.Error("HTTP CONSUMER ERROR", error.Message);
                }
            }
        }
    }

    // ---------------------------------------------------------------- request

    private async Task<List<object?>> RequestAsync(Schema schema, JsonObject request, int tries, CancellationToken ct)
    {
        var body = request["body"];
        var dataPath = Str(request["dataPath"]);
        var headers = request["headers"] as JsonObject;
        var method = Str(request["method"]) is { Length: > 0 } m ? m : "GET";
        var scope = ToScope(request["scope"]);
        var timeout = request["timeout"] is JsonValue tv && int.TryParse(tv.ToString(), out var t) ? t : (int?)null;
        var url = Str(request["url"]) ?? "";

        _logger.Info("GETTING RESOURCE");
        var resource = GetResourceName(schema);

        if (request["authentication"] is JsonObject authentication)
        {
            scope["Authorization"] = await AuthenticateAsync(authentication, headers, ct).ConfigureAwait(false);
        }

        _logger.Info($"RUNNING EXTRACTION FOR RESOURCE: {resource}");

        var compiledHeaders = headers is null
            ? null
            : ParseHeaders(Compile(headers.ToJsonString(), scope));

        var compiled = new HttpRequestSpec
        {
            Url = Compile(url, scope),
            Method = method,
            Data = body is null ? null : CompileBody(compiledHeaders, body, scope),
            Headers = compiledHeaders,
            Timeout = timeout,
        };

        var compiledJson = Json.Serialize(new { data = compiled.Data, headers = compiled.Headers, method = compiled.Method, timeout = compiled.Timeout, url = compiled.Url });
        _logger.Info("REQUESTING", compiledJson);

        var key = schema.Entity.ToUpperInvariant();
        _cache[key] = _cache.GetValueOrDefault(key) + 1;
        try
        {
            Directory.CreateDirectory(_paths.OutputDir);
            await File.WriteAllTextAsync(_paths.Output($"{schema.Entity.ToLowerInvariant()}-request-{_cache[key]:00000}.json"), compiledJson, ct).ConfigureAwait(false);
        }
        catch { }

        if (Truthy(request["useStream"]))
        {
            _logger.Info($"USING STREAM MODE FOR {resource}");
            return await RequestWithStreamAsync(schema, compiled, resource, tries, ct).ConfigureAwait(false);
        }

        object? response;
        try
        {
            var result = await _http.RequestAsync(compiled, ct).ConfigureAwait(false);
            response = ParseBody(result, compiledHeaders);
            if (!string.IsNullOrEmpty(dataPath)) response = SearchDataPath(response, dataPath);
        }
        catch (Exception error)
        {
            var detail = error is HttpRequestFailedException h ? h.Describe() : error.Message;
            _logger.Error($"TRYING({tries}) TO REQUESTING {resource}[{detail}]");
            if (tries <= _env.Retries)
            {
                await _utils.WaitAsync(Utils.CalculateRetryTime(tries, 30_000), ct).ConfigureAwait(false);
                return await RequestAsync(schema, request, tries + 1, ct).ConfigureAwait(false);
            }
            throw;
        }

        var list = Normalize(response, resource);
        if (list.Count == 0) return list;

        if (Utils.NeedsToHydrate(schema)) _logger.Info($"DATA FOR: {schema.Entity.ToUpperInvariant()} WILL BE TRANFORMED USING SCHEMA MAPS");

        var data = ApplyHydration(list, schema);
        var rawOnly = await SendResultsAsync(data, list, resource, ct).ConfigureAwait(false);
        return list;
    }

    private async Task<string> AuthenticateAsync(JsonObject authentication, JsonObject? headers, CancellationToken ct)
    {
        try
        {
            _logger.Info("STARTING AUTHENTICATION");
            var username = Str(authentication["username"]);
            var usernameKey = Str(authentication["usernameKey"]) ?? "username";
            var password = Str(authentication["password"]);
            var passwordKey = Str(authentication["passwordKey"]) ?? "password";
            var url = Str(authentication["url"]) ?? "";
            var path = Str(authentication["path"]);
            var method = Str(authentication["method"]) ?? "POST";
            var tokenType = Str(authentication["tokenType"]);

            Dictionary<string, string>? requestHeaders = null;
            if (headers is not null)
            {
                var insecure = headers.FirstOrDefault(h => h.Key.Equals("INSECURE", StringComparison.OrdinalIgnoreCase));
                if (insecure.Key is not null) requestHeaders = new Dictionary<string, string> { [insecure.Key] = Str(insecure.Value) ?? "" };
            }

            _logger.Info($"AUTHENTICATING TO: {url}");
            var result = await _http.RequestAsync(new HttpRequestSpec
            {
                Url = url,
                Method = method,
                Headers = requestHeaders,
                Data = new Dictionary<string, object?> { [usernameKey] = username, [passwordKey] = password },
            }, ct).ConfigureAwait(false);

            object? data = ParseBody(result, null);
            var token = string.IsNullOrEmpty(path) ? data : PathValue.Get(data, path);
            _logger.Info("AUTHENTICATION SUCCESSFUL");
            var text = PathValue.Stringify(token);
            return string.IsNullOrEmpty(tokenType) ? text : $"{tokenType}{text}";
        }
        catch (Exception error)
        {
            _logger.Error($"AUTHENTICATION FAILED: {error.Message}");
            throw;
        }
    }

    // ---------------------------------------------------------------- stream mode (OData/Atom)

    private async Task<List<object?>> RequestWithStreamAsync(Schema schema, HttpRequestSpec compiled, string resource, int tries, CancellationToken ct)
    {
        try
        {
            var (stream, response) = await _http.RequestStreamAsync(compiled, ct).ConfigureAwait(false);
            using (response)
            await using (stream)
            {
                var results = new List<object?>();
                var count = 0;
                await foreach (var entry in XmlToJson.StreamEntriesAsync(stream, ct).ConfigureAwait(false))
                {
                    count++;
                    results.Add(entry);
                    if (count % 100 == 0) _logger.Info($"Processados {count} entries via stream");
                }
                _logger.Info($"Stream concluído: {results.Count} itens processados");
                return await ProcessStreamResultsAsync(results, schema, resource, ct).ConfigureAwait(false);
            }
        }
        catch (Exception error)
        {
            var detail = error is HttpRequestFailedException h ? h.Describe() : error.Message;
            _logger.Error($"TRYING({tries}) TO REQUESTING {resource}[{detail}]");
            if (tries <= _env.Retries)
            {
                await _utils.WaitAsync(Utils.CalculateRetryTime(tries, 30_000), ct).ConfigureAwait(false);
                return await RequestWithStreamAsync(schema, compiled, resource, tries + 1, ct).ConfigureAwait(false);
            }
            throw;
        }
    }

    private async Task<List<object?>> ProcessStreamResultsAsync(List<object?> results, Schema schema, string resource, CancellationToken ct)
    {
        if (results.Count == 0)
        {
            _logger.Info($"EMPTY: {resource}");
            return results;
        }

        var allHydrated = new List<object?>();
        for (var start = 0; start < results.Count; start += StreamBatchSize)
        {
            var batchRaw = results.Skip(start).Take(StreamBatchSize).ToList();
            var batchHydrated = ApplyHydration(batchRaw, schema);
            allHydrated.AddRange(batchHydrated);
            await _utils.WaitAsync(_env.Throttle, ct).ConfigureAwait(false);
            await SendResultsAsync(batchHydrated, batchRaw, resource, ct).ConfigureAwait(false);
        }
        return allHydrated;
    }

    // ---------------------------------------------------------------- helpers

    private List<object?> ApplyHydration(List<object?> results, Schema schema)
    {
        if (!Utils.NeedsToHydrate(schema)) return results;
        return results.Select(item => item is Row row ? (object?)_hydrator.Hydrate(schema.Maps, row) : item).ToList();
    }

    /// <summary>Ships raw + hydrated data. Returns true when RAW_ONLY short-circuited.</summary>
    private async Task<bool> SendResultsAsync(List<object?> hydrated, List<object?> raw, string resource, CancellationToken ct)
    {
        if (_setting.Channel != "SAAS_S3")
        {
            await Task.WhenAll(
                _utils.WriteJsonAsync($"raw-{resource}", raw),
                _transport!.SendAsync($"raw/{resource}", raw, ct)).ConfigureAwait(false);
            await _utils.WaitAsync(_env.Throttle, ct).ConfigureAwait(false);

            if (_env.RawOnly && !resource.StartsWith("raw", StringComparison.Ordinal))
            {
                _logger.Warn("SENDING EXTRACTION TO RAW ONLY");
                return true;
            }
        }

        await Task.WhenAll(
            _utils.WriteJsonAsync(resource, hydrated),
            _transport!.SendAsync(resource, hydrated, ct)).ConfigureAwait(false);
        await _utils.WaitAsync(_env.Throttle, ct).ConfigureAwait(false);
        return false;
    }

    private string GetResourceName(Schema schema)
    {
        if (schema.InputFormat == "JSON") return schema.ApiResource;
        var json = _setting.Schemas.FirstOrDefault(s => s.InputFormat == "JSON" && s.ApiResource == schema.Entity);
        if (json is not null) return json.ApiResource;
        return string.IsNullOrEmpty(schema.ApiResource) ? schema.Entity : schema.ApiResource;
    }

    /// <summary>Port of handleRange: exposes current/end in scope and steps the counters.</summary>
    private static void HandleRange(JsonObject command)
    {
        if (command["range"] is not JsonObject range) return;

        var scope = command["scope"] as JsonObject ?? new JsonObject();
        command["scope"] = scope;
        scope["current"] = Str(range["current"]?["value"]) ?? "undefined";
        scope["end"] = Str(range["end"]?["value"]) ?? "undefined";

        foreach (var direction in new[] { "current", "end" })
        {
            if (range[direction] is not JsonObject bound || Str(bound["type"]) is not { Length: > 0 } type) continue;
            var value = ToDouble(bound["value"]);
            var step = ToDouble(bound["step"]);
            bound["value"] = type switch
            {
                "INT_DECREMENT" => value - step,
                "INT_INCREMENT" => value + step,
                _ => throw new InvalidOperationException("INVALID STEP TYPE"),
            };
        }
    }

    private object? SearchDataPath(object? data, string path)
    {
        try
        {
            _logger.Info("SEARCH DATA PATH");
            var tokens = new Queue<string>(path.Split('.'));
            object? current = data;
            while (tokens.Count > 0 && current is not null)
            {
                var key = tokens.Dequeue();
                current = key == "*" && tokens.Count > 0
                    ? PathValue.Get(current, $"*.{tokens.Dequeue()}")
                    : PathValue.Get(current, key);
            }

            if (current is not null)
            {
                var items = current is List<object?> list ? list : new List<object?> { current };
                current = items.Select(item => item is Row row
                    ? row.Aggregate(new Row(), (acc, kv) => { acc[kv.Key.ToUpperInvariant()] = kv.Value; return acc; })
                    : item).ToList();
            }
            _logger.Info("DATA PATH FOUND");
            return current ?? "";
        }
        catch (Exception error)
        {
            _logger.Error(error.Message);
            return null;
        }
    }

    private List<object?> Normalize(object? response, string resource)
    {
        switch (response)
        {
            case List<object?> list when list.Count > 0:
                return list;
            case List<object?>:
                _logger.Info($"EMPTY: {resource}");
                return new List<object?>();
            case Row row when row.Count == 0:
            case null:
            case string { Length: 0 }:
                _logger.Info($"EMPTY: {resource}");
                return new List<object?>();
            default:
                return new List<object?> { response };
        }
    }

    private static object? ParseBody(HttpResult result, IDictionary<string, string>? headers)
    {
        var accept = headers?.FirstOrDefault(h => h.Key.Equals("Accept", StringComparison.OrdinalIgnoreCase)).Value;
        var body = result.Body;
        if (string.IsNullOrWhiteSpace(body)) return null;

        if (accept == "application/xml" || (result.ContentType?.Contains("xml", StringComparison.OrdinalIgnoreCase) == true && body.TrimStart().StartsWith('<')))
        {
            try { return XmlToJson.Convert(body); } catch { return body; }
        }

        try { return Json.ToClr(Json.Parse(body)); }
        catch { return body; }
    }

    private string Compile(string template, IDictionary<string, object?> scope) => _interpolation.Interpolate(template, null, scope);

    private object? CompileBody(IDictionary<string, string>? headers, JsonNode body, IDictionary<string, object?> scope)
    {
        _logger.Info("COMPILE BODY");
        var contentType = headers?.FirstOrDefault(h => h.Key.Equals("Content-Type", StringComparison.OrdinalIgnoreCase)).Value;

        if (body is not JsonValue || !body.AsValue().TryGetValue<string>(out var text))
        {
            return Json.Parse(Compile(body.ToJsonString(), scope));
        }
        if (contentType is not null && contentType.StartsWith("application/json", StringComparison.OrdinalIgnoreCase))
        {
            return Json.Parse(Compile(text, scope));
        }
        return Compile(text, scope);
    }

    private static Dictionary<string, string> ParseHeaders(string json)
    {
        var result = new Dictionary<string, string>();
        if (Json.Parse(json) is JsonObject obj)
        {
            foreach (var (k, v) in obj) result[k] = v is JsonValue ? v.ToString() : v?.ToJsonString() ?? "";
        }
        return result;
    }

    private static Dictionary<string, object?> ToScope(JsonNode? node)
    {
        var scope = new Dictionary<string, object?>(StringComparer.Ordinal);
        if (node is JsonObject obj)
        {
            foreach (var (k, v) in obj) scope[k] = Json.ToClr(v);
        }
        return scope;
    }

    private static string? Str(JsonNode? node) => node switch
    {
        null => null,
        JsonValue v => v.ToString(),
        _ => node.ToJsonString(),
    };

    private static bool Truthy(JsonNode? node) => node is JsonValue v && (v.TryGetValue<bool>(out var b) ? b : v.ToString() is { Length: > 0 } s && s != "0" && s != "false");

    private static double ToDouble(JsonNode? node) => double.TryParse(Str(node), System.Globalization.NumberStyles.Any, System.Globalization.CultureInfo.InvariantCulture, out var d) ? d : 0;
}
