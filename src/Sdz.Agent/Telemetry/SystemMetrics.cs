using System.Runtime.InteropServices;
using System.Text.RegularExpressions;

namespace Sdz.Agent.Telemetry;

public readonly record struct CpuTimes(double Idle, double Total);
public readonly record struct DiskStats(long TotalBytes, long FreeBytes);

/// <summary>
/// Port of SystemMetricsAdapter. Methods are virtual so tests can substitute
/// platform readings. Every platform probe is best-effort: on failure it
/// falls back to zeros instead of throwing.
/// </summary>
public class SystemMetrics
{
    private static readonly Regex MemAvailableRegex = new(@"^MemAvailable:\s+(\d+)\s+kB$", RegexOptions.Multiline | RegexOptions.Compiled);

    public virtual int GetCpuCount() => Environment.ProcessorCount;

    public virtual CpuTimes SampleCpuTimes()
    {
        try
        {
            if (OperatingSystem.IsLinux()) return SampleLinuxCpuTimes();
            if (OperatingSystem.IsWindows()) return SampleWindowsCpuTimes();
            if (OperatingSystem.IsMacOS()) return SampleMacCpuTimes();
        }
        catch
        {
            // fall through
        }
        return new CpuTimes(0, 0);
    }

    public virtual double CpuPercentBetween(CpuTimes previous, CpuTimes current)
    {
        var idleDelta = current.Idle - previous.Idle;
        var totalDelta = current.Total - previous.Total;
        if (totalDelta <= 0) return 0;
        var busyRatio = 1 - idleDelta / totalDelta;
        return Math.Max(0, Math.Min(100, busyRatio * 100));
    }

    public virtual long GetMemTotalBytes()
    {
        try
        {
            if (OperatingSystem.IsLinux())
            {
                var match = Regex.Match(File.ReadAllText("/proc/meminfo"), @"^MemTotal:\s+(\d+)\s+kB$", RegexOptions.Multiline);
                if (match.Success) return long.Parse(match.Groups[1].Value) * 1024;
            }
            if (OperatingSystem.IsWindows() && TryWindowsMemory(out var total, out _)) return total;
            if (OperatingSystem.IsMacOS() && TryMacMemory(out var macTotal, out _)) return macTotal;
        }
        catch
        {
            // fall through
        }
        return GC.GetGCMemoryInfo().TotalAvailableMemoryBytes;
    }

    /// <summary>
    /// "Available" memory (not raw "free"): on Linux this is /proc/meminfo's
    /// MemAvailable, which accounts for reclaimable caches/buffers.
    /// </summary>
    public virtual long GetMemFreeBytes()
    {
        try
        {
            if (OperatingSystem.IsLinux())
            {
                var available = ReadLinuxMemAvailable();
                if (available is not null) return available.Value;
            }
            if (OperatingSystem.IsWindows() && TryWindowsMemory(out _, out var avail)) return avail;
            if (OperatingSystem.IsMacOS() && TryMacMemory(out _, out var macAvail)) return macAvail;
        }
        catch
        {
            // fall through
        }
        return 0;
    }

    public virtual DiskStats GetDiskStats(string path)
    {
        try
        {
            var drive = new DriveInfo(path);
            return new DiskStats(drive.TotalSize, drive.AvailableFreeSpace);
        }
        catch
        {
            return new DiskStats(0, 0);
        }
    }

    public virtual string GetHostname()
    {
        try { return System.Net.Dns.GetHostName(); }
        catch { return Environment.MachineName; }
    }

    public virtual string GetArch() => RuntimeInformation.OSArchitecture switch
    {
        Architecture.X64 => "x64",
        Architecture.X86 => "ia32",
        Architecture.Arm64 => "arm64",
        Architecture.Arm => "arm",
        var other => other.ToString().ToLowerInvariant(),
    };

    public virtual string GetOsVersion() => Environment.OSVersion.Version.ToString();

    public virtual string GetOsName()
    {
        if (OperatingSystem.IsWindows()) return "windows";
        if (OperatingSystem.IsLinux()) return "linux";
        if (OperatingSystem.IsMacOS()) return "darwin";
        if (OperatingSystem.IsFreeBSD()) return "freebsd";
        return RuntimeInformation.OSDescription.Split(' ')[0].ToLowerInvariant();
    }

    /// <summary>IANA timezone id (Windows ids are converted).</summary>
    public virtual string GetTimezone()
    {
        var id = TimeZoneInfo.Local.Id;
        if (OperatingSystem.IsWindows() && TimeZoneInfo.TryConvertWindowsIdToIanaId(id, out var iana)) return iana;
        return id;
    }

    /// <summary>Minutes east of UTC (America/Sao_Paulo => -180).</summary>
    public virtual int GetUtcOffsetMinutes() =>
        (int)Math.Round(TimeZoneInfo.Local.GetUtcOffset(DateTime.UtcNow).TotalMinutes);

    // ---- linux ----

    internal static long? ParseMemAvailable(string meminfo)
    {
        var match = MemAvailableRegex.Match(meminfo);
        return match.Success ? long.Parse(match.Groups[1].Value) * 1024 : null;
    }

    private static long? ReadLinuxMemAvailable()
    {
        try { return ParseMemAvailable(File.ReadAllText("/proc/meminfo")); }
        catch { return null; }
    }

    internal static CpuTimes ParseProcStat(string content)
    {
        // cpu  user nice system idle iowait irq softirq steal guest guest_nice
        var line = content.Split('\n').FirstOrDefault(l => l.StartsWith("cpu ", StringComparison.Ordinal));
        if (line is null) return new CpuTimes(0, 0);
        var parts = line.Split(' ', StringSplitOptions.RemoveEmptyEntries);
        double At(int i) => parts.Length > i && double.TryParse(parts[i], out var v) ? v : 0;
        var user = At(1); var nice = At(2); var system = At(3); var idle = At(4); var irq = At(6);
        // mirrors Node's os.cpus(): total = user + nice + sys + idle + irq
        return new CpuTimes(idle, user + nice + system + idle + irq);
    }

    private static CpuTimes SampleLinuxCpuTimes() => ParseProcStat(File.ReadAllText("/proc/stat"));

    // ---- windows ----

    [StructLayout(LayoutKind.Sequential)]
    private struct FILETIME { public uint Low; public uint High; public readonly ulong Value => ((ulong)High << 32) | Low; }

    [DllImport("kernel32.dll", SetLastError = true)]
    private static extern bool GetSystemTimes(out FILETIME idle, out FILETIME kernel, out FILETIME user);

    [StructLayout(LayoutKind.Sequential)]
    private struct MEMORYSTATUSEX
    {
        public uint Length;
        public uint MemoryLoad;
        public ulong TotalPhys;
        public ulong AvailPhys;
        public ulong TotalPageFile;
        public ulong AvailPageFile;
        public ulong TotalVirtual;
        public ulong AvailVirtual;
        public ulong AvailExtendedVirtual;
    }

    [DllImport("kernel32.dll", SetLastError = true)]
    private static extern bool GlobalMemoryStatusEx(ref MEMORYSTATUSEX buffer);

    private static CpuTimes SampleWindowsCpuTimes()
    {
        if (!GetSystemTimes(out var idle, out var kernel, out var user)) return new CpuTimes(0, 0);
        // kernel time already includes idle time
        return new CpuTimes(idle.Value, kernel.Value + user.Value);
    }

    private static bool TryWindowsMemory(out long total, out long available)
    {
        total = available = 0;
        var status = new MEMORYSTATUSEX { Length = (uint)Marshal.SizeOf<MEMORYSTATUSEX>() };
        if (!GlobalMemoryStatusEx(ref status)) return false;
        total = (long)status.TotalPhys;
        available = (long)status.AvailPhys;
        return true;
    }

    // ---- macOS (libSystem / mach) ----

    private const int HOST_CPU_LOAD_INFO = 3;
    private const int HOST_VM_INFO64 = 4;

    [DllImport("libSystem.dylib")] private static extern uint mach_host_self();
    [DllImport("libSystem.dylib")] private static extern int host_statistics(uint host, int flavor, uint[] info, ref uint count);
    [DllImport("libSystem.dylib")] private static extern int host_statistics64(uint host, int flavor, ulong[] info, ref uint count);
    [DllImport("libSystem.dylib")] private static extern int sysctlbyname(string name, out long value, ref nint size, nint newp, nint newlen);

    private static CpuTimes SampleMacCpuTimes()
    {
        var info = new uint[4]; // user, system, idle, nice
        var count = 4u;
        if (host_statistics(mach_host_self(), HOST_CPU_LOAD_INFO, info, ref count) != 0) return new CpuTimes(0, 0);
        double user = info[0], system = info[1], idle = info[2], nice = info[3];
        return new CpuTimes(idle, user + system + idle + nice);
    }

    private static bool TryMacMemory(out long total, out long available)
    {
        total = available = 0;
        var size = (nint)sizeof(long);
        if (sysctlbyname("hw.memsize", out total, ref size, 0, 0) != 0) return false;
        size = sizeof(long);
        if (sysctlbyname("hw.pagesize", out var pageSize, ref size, 0, 0) != 0) pageSize = 4096;

        // vm_statistics64: free, active, inactive, wire, zero_fill, reactivations, pageins, pageouts, faults,
        // cow, lookups, hits, purges, purgeable, speculative, decompressions, compressions, swapins, swapouts,
        // compressor_page_count, throttled, external, internal, total_uncompressed (all uint32)
        var raw = new ulong[20]; // 40 uint32 slots
        var count = 38u;
        if (host_statistics64(mach_host_self(), HOST_VM_INFO64, raw, ref count) != 0) return false;
        var words = MemoryMarshal.Cast<ulong, uint>(raw);
        long free = words[0], inactive = words[2], speculative = words[14];
        available = (free + inactive + speculative) * pageSize;
        return true;
    }
}
