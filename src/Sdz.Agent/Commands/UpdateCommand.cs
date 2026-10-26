using Sdz.Agent.Update;

namespace Sdz.Agent.Commands;

/// <summary>Replaces the old "git pull": checks the release manifest and applies the native package.</summary>
public sealed class UpdateCommand
{
    private readonly UpdateService _updates;

    public UpdateCommand(UpdateService updates) => _updates = updates;

    public async Task<int> ExecuteAsync(bool checkOnly, CancellationToken ct = default)
    {
        string? version;
        try
        {
            version = await _updates.CheckAndApplyAsync(apply: !checkOnly, ct).ConfigureAwait(false);
        }
        catch (Exception e)
        {
            Console.Error.WriteLine($"✖ UPDATE FAILED: {e.Message} ({_updates.ManifestUrl})");
            return 1;
        }
        if (version is null)
        {
            Console.WriteLine($"✔ UP TO DATE ({Core.Utils.Version})");
            return 0;
        }
        Console.WriteLine(checkOnly
            ? $"ℹ UPDATE AVAILABLE: {version}"
            : $"✔ UPDATE TO {version} STARTED, THE SERVICE WILL RESTART");
        return 0;
    }
}
