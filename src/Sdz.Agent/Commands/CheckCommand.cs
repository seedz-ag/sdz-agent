using System.Diagnostics;
using System.Net;
using Sdz.Agent.Api;
using Sdz.Agent.Core;
using Sdz.Agent.Core.Http;
using Sdz.Agent.Services;

namespace Sdz.Agent.Commands;

public sealed record ConnectionSpeed(string Download, string Upload);

public sealed class CheckResult
{
    public string Type { get; init; } = "all";
    public bool CheckAuth { get; set; }
    public bool CheckDataSource { get; set; }
    public bool CheckDns { get; set; }
    public ConnectionSpeed? CheckConnectionSpeed { get; set; }
}

/// <summary>Port of CheckCommand (auth | datasource | dns | speed | all).</summary>
public sealed class CheckCommand
{
    private readonly ApiService _api;
    private readonly ConsumerResolver _consumers;
    private readonly AgentEnvironment _env;
    private readonly HttpClientAdapter _http;

    public CheckCommand(ApiService api, ConsumerResolver consumers, AgentEnvironment env, HttpClientAdapter http)
    {
        _api = api;
        _consumers = consumers;
        _env = env;
        _http = http;
    }

    public async Task<CheckResult> ExecuteAsync(string type, CancellationToken ct = default)
    {
        var result = new CheckResult { Type = type };
        var all = type == "all";

        if (all || type == "auth") result.CheckAuth = await CheckAuthAsync(ct).ConfigureAwait(false);
        if (all || type == "dns") result.CheckDns = await CheckDnsAsync(ct).ConfigureAwait(false);
        if (all || type == "datasource") result.CheckDataSource = await CheckDataSourceAsync(ct).ConfigureAwait(false);
        if (all || type == "speed")
        {
            try { result.CheckConnectionSpeed = await CheckConnectionSpeedAsync(ct).ConfigureAwait(false); }
            catch { result.CheckConnectionSpeed = null; }
        }

        return result;
    }

    public async Task<bool> CheckAuthAsync(CancellationToken ct = default)
    {
        try
        {
            await _http.PostAsync<string>($"{_env.ApiUrl}auth",
                new { clientId = _env.ClientId, clientSecret = _env.ClientSecret },
                new RequestOptions { Timeout = 10_000 }, ct).ConfigureAwait(false);
            return true;
        }
        catch
        {
            return false;
        }
    }

    private async Task<bool> CheckDnsAsync(CancellationToken ct)
    {
        try
        {
            var host = new Uri(_env.ApiUrl).Host;
            var addresses = await Dns.GetHostAddressesAsync(host, ct).ConfigureAwait(false);
            return addresses.Length > 0;
        }
        catch
        {
            return false;
        }
    }

    private async Task<bool> CheckDataSourceAsync(CancellationToken ct)
    {
        try
        {
            var setting = await _api.GetSettingAsync(ct).ConfigureAwait(false);
            var consumer = _consumers.Resolve(setting.DataSource);
            consumer.SetSetting(setting);
            await consumer.ConsumeAsync(ct).ConfigureAwait(false);
            return true;
        }
        catch
        {
            return false;
        }
    }

    private async Task<ConnectionSpeed> CheckConnectionSpeedAsync(CancellationToken ct)
    {
        const int downloadBytes = 10_000_000;
        const int uploadBytes = 5_000_000;
        using var client = new HttpClient { Timeout = TimeSpan.FromMinutes(2) };

        var sw = Stopwatch.StartNew();
        using (var response = await client.GetAsync($"https://eu.httpbin.org/stream-bytes/{downloadBytes}", HttpCompletionOption.ResponseHeadersRead, ct).ConfigureAwait(false))
        await using (var stream = await response.Content.ReadAsStreamAsync(ct).ConfigureAwait(false))
        {
            var buffer = new byte[81920];
            long total = 0;
            int read;
            while ((read = await stream.ReadAsync(buffer, ct).ConfigureAwait(false)) > 0) total += read;
            sw.Stop();
            var download = Mbps(total, sw.Elapsed);

            sw.Restart();
            using var upload = new ByteArrayContent(new byte[uploadBytes]);
            using var post = await client.PostAsync("https://eu.httpbin.org/post", upload, ct).ConfigureAwait(false);
            sw.Stop();
            return new ConnectionSpeed(download, Mbps(uploadBytes, sw.Elapsed));
        }
    }

    private static string Mbps(long bytes, TimeSpan elapsed) =>
        elapsed.TotalSeconds <= 0 ? "0.00" : (bytes * 8 / 1_000_000d / elapsed.TotalSeconds).ToString("0.00", System.Globalization.CultureInfo.InvariantCulture);
}
