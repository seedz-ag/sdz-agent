using System.Data;
using System.Data.Common;
using Sdz.Agent.Core.Logging;

namespace Sdz.Agent.Data.Drivers;

/// <summary>
/// Shared plumbing for the ADO.NET based drivers: lazy connect, DBNull → null
/// row materialisation and the legacy "log and swallow" error policy.
/// </summary>
public abstract class AdoDriverBase : IDatabaseAdapter
{
    protected readonly DatabaseConfig Config;
    protected readonly Logger Logger;
    protected DbConnection? Connection;

    protected abstract string DriverName { get; }

    protected AdoDriverBase(DatabaseConfig config, Logger logger)
    {
        Config = config;
        Logger = logger;
    }

    protected abstract DbConnection CreateConnection();

    /// <summary>Hook run right after a successful open (e.g. ALTER SESSION).</summary>
    protected virtual Task AfterOpenAsync(DbConnection connection, CancellationToken ct) => Task.CompletedTask;

    protected virtual void ConfigureCommand(DbCommand command) { }

    public virtual string? BuildQuery(string query, IReadOnlyList<Api.Parameter> parameters) => null;

    public virtual Task<bool?> CheckConnectionAsync(CancellationToken ct = default) => Task.FromResult<bool?>(null);

    public async Task ConnectAsync(CancellationToken ct = default)
    {
        if (Connection is not null) return;
        try
        {
            var connection = CreateConnection();
            await connection.OpenAsync(ct).ConfigureAwait(false);
            await AfterOpenAsync(connection, ct).ConfigureAwait(false);
            Connection = connection;
        }
        catch (Exception e)
        {
            Logger.Error($"{DriverName} CONNECT ERROR", e);
        }
    }

    public async Task DisconnectAsync(CancellationToken ct = default)
    {
        if (Connection is null) return;
        try
        {
            await Connection.CloseAsync().ConfigureAwait(false);
            await Connection.DisposeAsync().ConfigureAwait(false);
        }
        catch (Exception e)
        {
            Logger.Error($"{DriverName} CLOSE ERROR", e);
        }
        finally
        {
            Connection = null;
        }
    }

    public async Task<List<Row>> ExecuteAsync(string query, CancellationToken ct = default)
    {
        if (Connection is null) await ConnectAsync(ct).ConfigureAwait(false);
        try
        {
            return await ReadAsync(query, ct).ConfigureAwait(false);
        }
        catch (Exception e)
        {
            Logger.Error($"{DriverName} EXECUTE ERROR", query, e);
            return new List<Row>();
        }
    }

    public async Task<object> ExecuteQueryRemoteAsync(string query, CancellationToken ct = default)
    {
        if (Connection is null) await ConnectAsync(ct).ConfigureAwait(false);
        try
        {
            return await ReadAsync(query, ct).ConfigureAwait(false);
        }
        catch (Exception e)
        {
            Logger.Error($"{DriverName} EXECUTE REMOTE ERROR", query, e);
            return e.Message;
        }
    }

    public abstract Task<string> GetVersionAsync(CancellationToken ct = default);

    public abstract Task<List<Row>> QueryAsync(string query, int? page, int? limit, CancellationToken ct = default);

    protected async Task<List<Row>> ReadAsync(string query, CancellationToken ct)
    {
        if (Connection is null) throw new InvalidOperationException($"{DriverName} NOT CONNECTED");

        await using var command = Connection.CreateCommand();
        command.CommandText = query;
        command.CommandTimeout = 0;
        ConfigureCommand(command);

        await using var reader = await command.ExecuteReaderAsync(CommandBehavior.SequentialAccess, ct).ConfigureAwait(false);
        // Oracle's DATE carries a time of day; everywhere else a DATE column has none and is serialised as yyyy-MM-dd
        return await MaterializeAsync(reader, ct, dateOnly: DriverName != "ORACLE").ConfigureAwait(false);
    }

    protected static async Task<List<Row>> MaterializeAsync(DbDataReader reader, CancellationToken ct, bool dateOnly = true)
    {
        var rows = new List<Row>();
        var names = new string[reader.FieldCount];
        var isDate = new bool[reader.FieldCount];
        for (var i = 0; i < names.Length; i++)
        {
            names[i] = reader.GetName(i);
            try { isDate[i] = dateOnly && string.Equals(reader.GetDataTypeName(i), "date", StringComparison.OrdinalIgnoreCase); }
            catch { isDate[i] = false; }
        }

        var values = new object[reader.FieldCount];
        while (await reader.ReadAsync(ct).ConfigureAwait(false))
        {
            reader.GetValues(values);
            var row = new Row(names.Length);
            for (var i = 0; i < names.Length; i++)
            {
                var v = values[i];
                row[names[i]] = v switch
                {
                    DBNull => null,
                    DateTime dt when isDate[i] => DateOnly.FromDateTime(dt),
                    _ => v,
                };
            }
            rows.Add(row);
        }

        return rows;
    }

    /// <summary>query + "LIMIT n" + "OFFSET page*n" (TS: `page && limit` means page 0 adds nothing).</summary>
    protected static string LimitOffset(string query, int? page, int? limit)
    {
        var parts = new List<string> { query };
        if (limit is > 0) parts.Add($"LIMIT {limit}");
        if (page is > 0 && limit is > 0) parts.Add($"OFFSET {page * limit}");
        return string.Join(" ", parts);
    }

    public async ValueTask DisposeAsync()
    {
        await DisconnectAsync().ConfigureAwait(false);
        GC.SuppressFinalize(this);
    }
}
