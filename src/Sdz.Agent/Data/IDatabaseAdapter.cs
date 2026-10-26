using Sdz.Agent.Api;

namespace Sdz.Agent.Data;

/// <summary>
/// Port of IDatabaseAdapter. Rows are ordered dictionaries keyed by the column
/// name exactly as the database returns it; DBNull must be mapped to null.
/// </summary>
public interface IDatabaseAdapter : IAsyncDisposable
{
    /// <summary>Optional driver-specific placeholder substitution. Null means "use the default".</summary>
    string? BuildQuery(string query, IReadOnlyList<Parameter> parameters) => null;

    /// <summary>Optional driver-specific connectivity check. Null means "run SELECT 1".</summary>
    Task<bool?> CheckConnectionAsync(CancellationToken ct = default) => Task.FromResult<bool?>(null);

    Task ConnectAsync(CancellationToken ct = default);
    Task DisconnectAsync(CancellationToken ct = default);

    /// <summary>Runs the statement as-is. Errors are logged and yield an empty list (legacy behaviour).</summary>
    Task<List<Row>> ExecuteAsync(string query, CancellationToken ct = default);

    /// <summary>Runs a statement coming from the listen channel; on error returns the error description instead of throwing.</summary>
    Task<object> ExecuteQueryRemoteAsync(string query, CancellationToken ct = default);

    Task<string> GetVersionAsync(CancellationToken ct = default);

    /// <summary>Runs the (already interpolated) query adding driver-specific pagination.</summary>
    Task<List<Row>> QueryAsync(string query, int? page, int? limit, CancellationToken ct = default);
}
