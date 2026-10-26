using Sdz.Agent.Consumers;
using Sdz.Agent.Core.Logging;

namespace Sdz.Agent.Services;

/// <summary>Port of ConsumerResolverService.</summary>
public sealed class ConsumerResolver
{
    private readonly DatabaseConsumer _database;
    private readonly FtpConsumer _ftp;
    private readonly HttpConsumer _http;
    private readonly Logger _logger;

    public ConsumerResolver(DatabaseConsumer database, FtpConsumer ftp, HttpConsumer http, Logger logger)
    {
        _database = database;
        _ftp = ftp;
        _http = http;
        _logger = logger;
    }

    public IConsumer Resolve(string dataSource)
    {
        _logger.Info($"RESOLVING CONSUMER: {dataSource.ToUpperInvariant()}");
        IConsumer? consumer = dataSource.ToUpperInvariant() switch
        {
            "API" or "HTTP" or "WS" => _http,
            "DATABASE" or "DB" => _database,
            "FTP" => _ftp,
            _ => null,
        };
        if (consumer is null)
        {
            _logger.Error("DATASOURCE CONSUMER NOT FOUND");
            throw new InvalidOperationException("DATASOURCE CONSUMER NOT FOUND");
        }
        _logger.Info("CONSUMER RESOLVED");
        return consumer;
    }
}
