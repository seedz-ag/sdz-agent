package telemetry

import (
	"os"
	"runtime"
	"time"

	"github.com/shirou/gopsutil/v4/cpu"
	"github.com/shirou/gopsutil/v4/disk"
	"github.com/shirou/gopsutil/v4/host"
	"github.com/shirou/gopsutil/v4/mem"
)

// CPUTimes is an idle/total snapshot used to compute busy % between two samples.
type CPUTimes struct {
	Idle  float64
	Total float64
}

type DiskStats struct {
	TotalBytes uint64
	FreeBytes  uint64
}

// SystemMetrics is the port of SystemMetricsAdapter (gopsutil-backed, cross-platform).
type SystemMetrics struct{}

func NewSystemMetrics() *SystemMetrics { return &SystemMetrics{} }

func (m *SystemMetrics) CPUCount() int {
	if n, err := cpu.Counts(true); err == nil && n > 0 {
		return n
	}
	return runtime.NumCPU()
}

func (m *SystemMetrics) SampleCPUTimes() CPUTimes {
	times, err := cpu.Times(false)
	if err != nil || len(times) == 0 {
		return CPUTimes{}
	}
	t := times[0]
	idle := t.Idle + t.Iowait
	total := t.User + t.System + t.Idle + t.Nice + t.Iowait + t.Irq + t.Softirq + t.Steal
	return CPUTimes{Idle: idle, Total: total}
}

func (m *SystemMetrics) CPUPercentBetween(prev, cur CPUTimes) float64 {
	idleDelta := cur.Idle - prev.Idle
	totalDelta := cur.Total - prev.Total
	if totalDelta <= 0 {
		return 0
	}
	busy := (1 - idleDelta/totalDelta) * 100
	if busy < 0 {
		return 0
	}
	if busy > 100 {
		return 100
	}
	return busy
}

func (m *SystemMetrics) MemTotalBytes() uint64 {
	if v, err := mem.VirtualMemory(); err == nil {
		return v.Total
	}
	return 0
}

// MemFreeBytes is "available" memory (MemAvailable on Linux), not raw free.
func (m *SystemMetrics) MemFreeBytes() uint64 {
	if v, err := mem.VirtualMemory(); err == nil {
		return v.Available
	}
	return 0
}

func (m *SystemMetrics) DiskStats(path string) DiskStats {
	u, err := disk.Usage(path)
	if err != nil {
		return DiskStats{}
	}
	return DiskStats{TotalBytes: u.Total, FreeBytes: u.Free}
}

func (m *SystemMetrics) Hostname() string {
	h, _ := os.Hostname()
	return h
}

func (m *SystemMetrics) Arch() string {
	switch runtime.GOARCH {
	case "amd64":
		return "x64"
	case "arm64":
		return "arm64"
	case "386":
		return "ia32"
	case "arm":
		return "arm"
	default:
		return runtime.GOARCH
	}
}

func (m *SystemMetrics) OSVersion() string {
	if info, err := host.Info(); err == nil {
		if info.KernelVersion != "" {
			return info.KernelVersion
		}
		return info.PlatformVersion
	}
	return ""
}

func (m *SystemMetrics) OSName() string {
	switch runtime.GOOS {
	case "windows", "linux", "darwin":
		return runtime.GOOS
	default:
		return runtime.GOOS
	}
}

// Timezone returns the IANA zone name when known ("Local" is resolved through TZ or /etc/localtime).
func (m *SystemMetrics) Timezone() string {
	name := time.Local.String()
	if name != "Local" {
		return name
	}
	if tz := os.Getenv("TZ"); tz != "" {
		return tz
	}
	if link, err := os.Readlink("/etc/localtime"); err == nil {
		if i := indexOf(link, "zoneinfo/"); i >= 0 {
			return link[i+len("zoneinfo/"):]
		}
	}
	if runtime.GOOS == "windows" {
		if iana, ok := windowsZones[windowsZoneName()]; ok {
			return iana
		}
	}
	abbr, _ := time.Now().Zone()
	return abbr
}

func (m *SystemMetrics) UTCOffsetMinutes() int {
	_, off := time.Now().Zone()
	return off / 60
}

func indexOf(s, sub string) int {
	for i := 0; i+len(sub) <= len(s); i++ {
		if s[i:i+len(sub)] == sub {
			return i
		}
	}
	return -1
}

func windowsZoneName() string {
	name, _ := time.Now().Zone()
	return name
}

// Small Windows → IANA table for the zones Seedz customers run on (fallback is the abbreviation).
var windowsZones = map[string]string{
	"E. South America Standard Time": "America/Sao_Paulo",
	"E. South America Daylight Time": "America/Sao_Paulo",
	"Central Brazilian Standard Time": "America/Cuiaba",
	"SA Eastern Standard Time":        "America/Belem",
	"SA Western Standard Time":        "America/Manaus",
	"Argentina Standard Time":         "America/Argentina/Buenos_Aires",
	"Paraguay Standard Time":          "America/Asuncion",
	"Pacific SA Standard Time":        "America/Santiago",
	"Eastern Standard Time":           "America/New_York",
	"Central Standard Time":           "America/Chicago",
	"Pacific Standard Time":           "America/Los_Angeles",
	"UTC":                             "UTC",
	"W. Europe Standard Time":         "Europe/Berlin",
	"GMT Standard Time":               "Europe/London",
	"-03":                             "America/Sao_Paulo",
}
