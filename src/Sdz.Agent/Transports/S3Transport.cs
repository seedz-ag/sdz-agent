using Amazon;
using Amazon.S3;
using Amazon.S3.Model;
using Sdz.Agent.Api;
using Sdz.Agent.Core;
using Sdz.Agent.Core.Logging;

namespace Sdz.Agent.Transports;

/// <summary>Port of S3Transport (channel SAAS_S3): writes chunks/files straight to the raw bucket.</summary>
public sealed class S3Transport : ITransport
{
    private static readonly Dictionary<string, string> MimeTypes = new(StringComparer.OrdinalIgnoreCase)
    {
        [".txt"] = "text/plain",
        [".csv"] = "text/csv",
        [".json"] = "application/json",
        [".xml"] = "application/xml",
        [".pdf"] = "application/pdf",
        [".zip"] = "application/zip",
    };

    private readonly ApiService _api;
    private readonly AgentEnvironment _env;
    private readonly Logger _logger;
    private readonly Utils _utils;
    private IAmazonS3? _s3;
    private Setting? _setting;

    public S3Transport(ApiService api, AgentEnvironment env, Logger logger, Utils utils)
    {
        _api = api;
        _env = env;
        _logger = logger;
        _utils = utils;
    }

    public void SetSetting(Setting setting) => _setting = setting;

    private IAmazonS3 Client()
    {
        if (_s3 is not null) return _s3;
        var region = string.IsNullOrEmpty(_env.AmazonRegion) ? null : RegionEndpoint.GetBySystemName(_env.AmazonRegion);
        var key = _env.AmazonAccessKey;
        var secret = _env.AmazonAccessSecretKey;
        _s3 = string.IsNullOrEmpty(key) || string.IsNullOrEmpty(secret)
            ? (region is null ? new AmazonS3Client() : new AmazonS3Client(region))
            : (region is null ? new AmazonS3Client(key, secret) : new AmazonS3Client(key, secret, region));
        return _s3;
    }

    public async Task SendAsync(string resource, IReadOnlyList<object?> data, CancellationToken ct = default)
    {
        _logger.Info($"SENDING {data.Count} LINES/FILE TO /{resource}");
        _setting ??= await _api.GetSettingAsync(ct).ConfigureAwait(false);
        await UploadAsync(resource, data, ct).ConfigureAwait(false);
        await _utils.WaitAsync(_env.Throttle, ct).ConfigureAwait(false);
    }

    private async Task UploadAsync(string resource, IReadOnlyList<object?> data, CancellationToken ct)
    {
        var setting = _setting!;
        var bucket = setting.Parameter("AMAZON_S3_RAW_BUCKET");
        var date = DateTime.Now.ToString("yyyy-MM-dd");

        if (data.OfType<byte[]>().FirstOrDefault() is { } fileData)
        {
            var resourcePath = resource.Split('/')[0];
            var fileName = resource.Contains('/') ? resource[(resource.LastIndexOf('/') + 1)..] : resource;
            var extension = resource.Contains('.') ? resource[resource.LastIndexOf('.')..] : ".txt";
            var key = $"{setting.TenantId}/{setting.Id}/{resourcePath}/{date}/{fileName}";

            _logger.Info($"UPLOAD FTP FILE TO {bucket} - {key}");
            using var body = new MemoryStream(fileData);
            await Client().PutObjectAsync(new PutObjectRequest
            {
                BucketName = bucket,
                Key = key,
                InputStream = body,
                ContentType = MimeTypes.GetValueOrDefault(extension, "application/octet-stream"),
            }, ct).ConfigureAwait(false);
            return;
        }

        foreach (var chunk in _utils.ChunkData(data))
        {
            _logger.Info($"SENDING CHUNK {chunk.Count} LINES TO /{resource}");
            await Client().PutObjectAsync(new PutObjectRequest
            {
                BucketName = bucket,
                Key = $"{setting.TenantId}/{setting.Id}/{resource}/{date}/{Guid.NewGuid()}.json",
                ContentBody = Json.Serialize(chunk),
                ContentType = "application/json",
            }, ct).ConfigureAwait(false);
        }
    }
}
