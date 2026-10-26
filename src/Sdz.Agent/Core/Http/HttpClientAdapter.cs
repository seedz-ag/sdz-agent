using System.Net;
using System.Net.Http.Headers;
using System.Net.Security;
using System.Security.Cryptography.X509Certificates;
using System.Text;
using System.Text.Json.Nodes;
using Sdz.Agent.Telemetry;

namespace Sdz.Agent.Core.Http;

public sealed class HttpRequestFailedException : Exception
{
    public int? StatusCode { get; }
    public string? StatusText { get; }
    public string? Body { get; }
    public string? Code { get; }

    public HttpRequestFailedException(string message, int? statusCode, string? statusText, string? body, string? code, Exception? inner = null)
        : base(message, inner)
    {
        StatusCode = statusCode;
        StatusText = statusText;
        Body = body;
        Code = code;
    }

    public bool IsTimeout => Code is "ECONNABORTED" or "ETIMEDOUT";

    /// <summary>Port of APIService.formatRequestError.</summary>
    public string Describe()
    {
        var parts = new List<string>();
        if (StatusCode is { } s) parts.Add($"status={s}");
        if (!string.IsNullOrEmpty(StatusText)) parts.Add($"statusText={StatusText}");
        if (!string.IsNullOrEmpty(Code)) parts.Add($"code={Code}");
        var hasData = !string.IsNullOrWhiteSpace(Body) && Body!.Trim() != "{}";
        if (hasData) parts.Add($"data={Body}");
        else if (!string.IsNullOrEmpty(Message)) parts.Add($"message={Message}");
        return parts.Count > 0 ? string.Join(" ", parts) : "unknown error";
    }
}

public sealed class RequestOptions
{
    public IDictionary<string, string>? Headers { get; init; }
    public int? Timeout { get; init; }
}

public sealed record HttpRequestSpec
{
    public required string Url { get; init; }
    public string Method { get; init; } = "GET";
    public object? Data { get; init; }
    public IDictionary<string, string>? Headers { get; init; }
    public int? Timeout { get; init; }
}

public sealed record HttpResult(string Body, HttpResponseHeaders Headers, HttpContentHeaders ContentHeaders, int StatusCode)
{
    public string? ContentType => ContentHeaders.ContentType?.MediaType;
    public JsonNode? AsJson() => string.IsNullOrWhiteSpace(Body) ? null : Json.Parse(Body);
}

/// <summary>
/// Port of HttpClientAdapter: thin wrapper over HttpClient that honours the
/// agent's conventions (an INSECURE header disables TLS validation, a
/// Certificate-Authority header carries a PEM CA, per-request timeouts) and
/// passively feeds the network telemetry recorder.
/// </summary>
public sealed class HttpClientAdapter
{
    private static readonly string[] ForbiddenHeaders = { "Certificate-Authority" };
    private readonly NetworkTelemetryRecorder _recorder;
    private readonly Dictionary<string, HttpClient> _clients = new();
    private readonly object _lock = new();
    private readonly string _userAgent;

    public HttpClientAdapter(NetworkTelemetryRecorder recorder)
    {
        _recorder = recorder;
        _userAgent = $"sdz-agent/{Utils.Version}";
    }

    public Task<T?> GetAsync<T>(string url, RequestOptions? options = null, CancellationToken ct = default) =>
        SendJsonAsync<T>(HttpMethod.Get, url, null, options, ct);

    public Task<T?> PostAsync<T>(string url, object? payload, RequestOptions? options = null, CancellationToken ct = default) =>
        SendJsonAsync<T>(HttpMethod.Post, url, payload, options, ct);

    public Task<T?> PatchAsync<T>(string url, object? payload, RequestOptions? options = null, CancellationToken ct = default) =>
        SendJsonAsync<T>(HttpMethod.Patch, url, payload, options, ct);

    public Task<T?> PutAsync<T>(string url, object? payload, RequestOptions? options = null, CancellationToken ct = default) =>
        SendJsonAsync<T>(HttpMethod.Put, url, payload, options, ct);

    public Task<T?> DeleteAsync<T>(string url, RequestOptions? options = null, CancellationToken ct = default) =>
        SendJsonAsync<T>(HttpMethod.Delete, url, null, options, ct);

    /// <summary>Same as PostAsync but returns the raw result (used by telemetry to read the Date header).</summary>
    public Task<HttpResult> PostRawAsync(string url, object? payload, RequestOptions? options = null, CancellationToken ct = default) =>
        RequestAsync(new HttpRequestSpec { Url = url, Method = "POST", Data = payload, Headers = options?.Headers, Timeout = options?.Timeout }, ct);

    private async Task<T?> SendJsonAsync<T>(HttpMethod method, string url, object? payload, RequestOptions? options, CancellationToken ct)
    {
        var result = await RequestAsync(new HttpRequestSpec
        {
            Url = url,
            Method = method.Method,
            Data = payload,
            Headers = options?.Headers,
            Timeout = options?.Timeout,
        }, ct).ConfigureAwait(false);

        if (typeof(T) == typeof(string)) return (T?)(object?)result.Body;
        if (typeof(T) == typeof(HttpResult)) return (T?)(object?)result;
        if (string.IsNullOrWhiteSpace(result.Body)) return default;
        if (typeof(T) == typeof(JsonNode)) return (T?)(object?)Json.Parse(result.Body);
        return Json.Deserialize<T>(result.Body);
    }

    /// <summary>Generic request used by the HTTP consumer. Returns the body as text.</summary>
    public async Task<HttpResult> RequestAsync(HttpRequestSpec spec, CancellationToken ct = default)
    {
        using var response = await ExecuteAsync(spec, HttpCompletionOption.ResponseContentRead, ct).ConfigureAwait(false);
        var body = await response.Content.ReadAsStringAsync(ct).ConfigureAwait(false);
        return new HttpResult(body, response.Headers, response.Content.Headers, (int)response.StatusCode);
    }

    /// <summary>Opens a streaming response (listen channel and XML stream mode).</summary>
    public async Task<(Stream Stream, HttpResponseMessage Response)> RequestStreamAsync(HttpRequestSpec spec, CancellationToken ct = default)
    {
        var response = await ExecuteAsync(spec, HttpCompletionOption.ResponseHeadersRead, ct).ConfigureAwait(false);
        var stream = await response.Content.ReadAsStreamAsync(ct).ConfigureAwait(false);
        return (stream, response);
    }

    private async Task<HttpResponseMessage> ExecuteAsync(HttpRequestSpec spec, HttpCompletionOption completion, CancellationToken ct)
    {
        var headers = spec.Headers ?? new Dictionary<string, string>();
        var insecure = headers.Keys.Any(k => k.Equals("INSECURE", StringComparison.OrdinalIgnoreCase));
        var ca = headers.TryGetValue("Certificate-Authority", out var pem) ? pem : null;
        var client = GetClient(insecure, ca);

        using var request = new HttpRequestMessage(new HttpMethod(spec.Method.ToUpperInvariant()), spec.Url);
        request.Headers.TryAddWithoutValidation("User-Agent", _userAgent);
        // one connection per request, as the Node agent did (axios without keep-alive): avoids
        // "response ended prematurely" when the API side drops idle pooled connections
        request.Headers.ConnectionClose = true;

        string? contentType = null;
        foreach (var (key, value) in headers)
        {
            if (ForbiddenHeaders.Contains(key)) continue;
            if (key.Equals("Content-Type", StringComparison.OrdinalIgnoreCase)) { contentType = value; continue; }
            if (key.Equals("Content-Length", StringComparison.OrdinalIgnoreCase)) continue;
            request.Headers.TryAddWithoutValidation(key, value);
        }

        if (spec.Data is not null && spec.Method.ToUpperInvariant() is not ("GET" or "HEAD"))
        {
            request.Content = BuildContent(spec.Data, contentType);
        }
        else if (contentType is not null && spec.Data is not null)
        {
            request.Content = BuildContent(spec.Data, contentType);
        }

        var timeout = TimeSpan.FromMilliseconds(spec.Timeout is > 0 ? spec.Timeout.Value : 300_000);
        using var cts = CancellationTokenSource.CreateLinkedTokenSource(ct);
        cts.CancelAfter(timeout);

        var startedAt = DateTime.UtcNow;
        try
        {
            var response = await client.SendAsync(request, completion, cts.Token).ConfigureAwait(false);
            if (!response.IsSuccessStatusCode)
            {
                var body = await SafeReadAsync(response).ConfigureAwait(false);
                var status = (int)response.StatusCode;
                var reason = response.ReasonPhrase;
                response.Dispose();
                _recorder.RecordRequest(NetworkOutcome.Error, Elapsed(startedAt));
                throw new HttpRequestFailedException($"Request failed with status code {status}", status, reason, body, null);
            }
            _recorder.RecordRequest(NetworkOutcome.Ok, Elapsed(startedAt));
            return response;
        }
        catch (HttpRequestFailedException)
        {
            throw;
        }
        catch (OperationCanceledException ex) when (!ct.IsCancellationRequested)
        {
            _recorder.RecordRequest(NetworkOutcome.Timeout, Elapsed(startedAt));
            throw new HttpRequestFailedException($"timeout of {timeout.TotalMilliseconds}ms exceeded", null, null, null, "ECONNABORTED", ex);
        }
        catch (HttpRequestException ex)
        {
            _recorder.RecordRequest(NetworkOutcome.Error, Elapsed(startedAt));
            var code = ex.HttpRequestError switch
            {
                HttpRequestError.NameResolutionError => "ENOTFOUND",
                HttpRequestError.ConnectionError => "ECONNREFUSED",
                HttpRequestError.SecureConnectionError => "EPROTO",
                _ => ex.HttpRequestError.ToString(),
            };
            throw new HttpRequestFailedException(ex.Message, null, null, null, code, ex);
        }
    }

    private static HttpContent BuildContent(object data, string? contentType)
    {
        var mediaType = contentType?.Split(';')[0].Trim();
        switch (data)
        {
            case HttpContent content:
                return content;
            case byte[] bytes:
                var bin = new ByteArrayContent(bytes);
                bin.Headers.ContentType = new MediaTypeHeaderValue(mediaType ?? "application/octet-stream");
                return bin;
            case string text:
                return new StringContent(text, Encoding.UTF8, mediaType ?? "text/plain");
            default:
                return new StringContent(Json.Serialize(data), Encoding.UTF8, mediaType ?? "application/json");
        }
    }

    private static async Task<string?> SafeReadAsync(HttpResponseMessage response)
    {
        try { return await response.Content.ReadAsStringAsync().ConfigureAwait(false); }
        catch { return null; }
    }

    private static double Elapsed(DateTime startedAt) => (DateTime.UtcNow - startedAt).TotalMilliseconds;

    private HttpClient GetClient(bool insecure, string? ca)
    {
        var key = $"{insecure}|{ca?.GetHashCode() ?? 0}";
        lock (_lock)
        {
            if (_clients.TryGetValue(key, out var existing)) return existing;

            var handler = new SocketsHttpHandler
            {
                PooledConnectionLifetime = TimeSpan.FromMinutes(10),
                AutomaticDecompression = DecompressionMethods.All,
                ConnectTimeout = TimeSpan.FromSeconds(30),
            };

            if (insecure)
            {
                handler.SslOptions.RemoteCertificateValidationCallback = (_, _, _, _) => true;
            }
            else if (!string.IsNullOrWhiteSpace(ca))
            {
                var authority = X509Certificate2.CreateFromPem(ca);
                handler.SslOptions.RemoteCertificateValidationCallback = (_, cert, chain, errors) =>
                {
                    if (errors == SslPolicyErrors.None) return true;
                    if (cert is null || chain is null) return false;
                    chain.ChainPolicy.TrustMode = X509ChainTrustMode.CustomRootTrust;
                    chain.ChainPolicy.CustomTrustStore.Add(authority);
                    return chain.Build(new X509Certificate2(cert));
                };
            }

            var client = new HttpClient(handler, disposeHandler: true)
            {
                Timeout = Timeout.InfiniteTimeSpan, // per-request CTS handles timeouts
            };
            _clients[key] = client;
            return client;
        }
    }
}
