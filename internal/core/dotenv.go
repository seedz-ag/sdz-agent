package core

import (
	"bufio"
	"os"
	"os/user"
	"path/filepath"
	"runtime"
	"strconv"
	"strings"
)

// ReadDotEnv parses a .env file compatible with the ones the Node agent produced.
func ReadDotEnv(path string) map[string]string {
	result := map[string]string{}
	f, err := os.Open(path)
	if err != nil {
		return result
	}
	defer f.Close()
	sc := bufio.NewScanner(f)
	sc.Buffer(make([]byte, 1024*1024), 1024*1024)
	for sc.Scan() {
		line := strings.TrimSpace(sc.Text())
		if line == "" || strings.HasPrefix(line, "#") {
			continue
		}
		line = strings.TrimPrefix(line, "export ")
		eq := strings.Index(line, "=")
		if eq <= 0 {
			continue
		}
		key := strings.TrimSpace(line[:eq])
		value := strings.TrimSpace(line[eq+1:])
		if len(value) >= 2 && (value[0] == '"' || value[0] == '\'') {
			quote := value[0]
			if end := strings.LastIndexByte(value, quote); end > 0 {
				value = value[1:end]
				if quote == '"' {
					value = strings.ReplaceAll(value, `\n`, "\n")
				}
			}
		} else if i := strings.Index(value, " #"); i >= 0 {
			value = strings.TrimSpace(value[:i])
		}
		result[key] = value
	}
	return result
}

// WriteDotEnv writes key=value lines (quoting when needed) with owner-only permissions.
func WriteDotEnv(path string, values [][2]string) error {
	var sb strings.Builder
	for _, kv := range values {
		v := kv[1]
		if strings.ContainsAny(v, " \t#\"") {
			v = `"` + strings.ReplaceAll(v, `"`, `\"`) + `"`
		}
		sb.WriteString(kv[0] + "=" + v + "\n")
	}
	if err := os.MkdirAll(filepath.Dir(path), 0o750); err != nil {
		return err
	}
	if err := os.WriteFile(path, []byte(sb.String()), 0o600); err != nil {
		return err
	}
	if runtime.GOOS != "windows" {
		mode := os.FileMode(0o600)
		if os.Geteuid() == 0 && chgrp(path, DotEnvGroup) {
			mode = 0o640 // tray/CLI users in the sdz-agent group may read it
		}
		_ = os.Chmod(path, mode)
	}
	return nil
}

// DotEnvGroup is the group allowed to read the .env (same group as the control socket).
const DotEnvGroup = "sdz-agent"

func chgrp(path, group string) bool {
	g, err := user.LookupGroup(group)
	if err != nil {
		return false
	}
	gid, err := strconv.Atoi(g.Gid)
	if err != nil {
		return false
	}
	return os.Chown(path, -1, gid) == nil
}
