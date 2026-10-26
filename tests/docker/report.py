#!/usr/bin/env python3
"""Builds the markdown comparison table from the bench outputs."""
import re, os, sys, glob, json, collections, subprocess, datetime
S = os.path.dirname(os.path.abspath(__file__))
drivers = ["postgres", "redshift", "mongo", "firebird", "mssql", "oracle", "mysql", "odbc"]
kinds = ["dotnet", "go"]

def parse_time(path):
    r = {}
    if not os.path.exists(path): return r
    for line in open(path):
        if "Elapsed (wall clock)" in line:
            v = line.split(":", 1)[1].strip() if "seconds" in line else line.split("):")[1].strip()
            if "seconds" in line and ":" not in v:
                r["wall"] = float(v.replace(",", "."))
            else:
                parts = [float(x) for x in v.split(":")]
                r["wall"] = parts[-1] + 60 * parts[-2] + (3600 * parts[-3] if len(parts) == 3 else 0)
        elif "Maximum resident" in line: r["rss_mb"] = int(line.split(":")[1]) / 1024
        elif line.startswith("\tUser time") or line.startswith("User time"): r["user"] = float(line.split(":")[1])
        elif line.startswith("\tSystem time") or line.startswith("System time"): r["sys"] = float(line.split(":")[1])
        elif line.startswith("exit="): r["exit"] = int(line.split("=")[1])
    return r

def rows(d):
    n = 0
    for f in glob.glob(os.path.join(d, "raw-*.json")):
        try: n += len(json.load(open(f)))
        except Exception: pass
    return n

def total_extraction(log):
    try:
        for line in open(log, errors="replace"):
            if "TOTAL EXTRACTION" in line: return line.strip().split("TOTAL EXTRACTION",1)[1].strip(" :")
    except FileNotFoundError: pass
    return ""

def compare(d):
    try:
        out = subprocess.run([sys.executable, "-I", os.path.join(S, "compare.py"), f"{S}/out-{d}-dotnet", f"{S}/out-{d}-go", d], capture_output=True, text=True).stdout
        verdict = "idênticas" if "RESULT: IDENTICAL" in out else "diferem"
        notes = [l.strip() for l in out.splitlines() if l.strip() and not l.strip().endswith("OK") and not l.startswith("RESULT") and not l.startswith(d) and "entity" not in l]
        return verdict, notes
    except Exception as e:
        return "?", [str(e)]

def fmt(v, unit="", nd=1):
    return "—" if v is None else f"{v:.{nd}f}{unit}"

lines = []
lines.append(f"# Comparativo .NET × Go — extração por conector ({datetime.date.today():%d/%m/%Y})\n")
lines.append("Mesma máquina, mesmos bancos em Docker (4.000 linhas em 8 tabelas), mesma setting de dev. Uma extração completa (`execute -c`) por conector e por agente, medida com `/usr/bin/time -v` (ODBC roda em container: tempo de parede + pico de memória amostrado pelo `docker stats`).\n")
lines.append("| Conector | Tempo .NET | Tempo Go | Pico RAM .NET | Pico RAM Go | CPU .NET (user+sys) | CPU Go (user+sys) | Linhas .NET | Linhas Go | Saídas |")
lines.append("|---|---|---|---|---|---|---|---|---|---|")
details = []
for d in drivers:
    t = {k: parse_time(f"{S}/time-{d}-{k}.txt") for k in kinds}
    if not t["dotnet"] and not t["go"]: continue
    n = {k: rows(f"{S}/out-{d}-{k}") for k in kinds}
    verdict, notes = compare(d)
    def cpu(k): return None if "user" not in t[k] else t[k]["user"] + t[k].get("sys", 0)
    exits = {k: t[k].get("exit") for k in kinds}
    name = d.upper() if d != "redshift" else "REDSHIFT (pg)"
    flag = "" if all(e == 0 for e in exits.values()) else f" (exit {exits['dotnet']}/{exits['go']})"
    lines.append(f"| {name}{flag} | {fmt(t['dotnet'].get('wall'),' s')} | {fmt(t['go'].get('wall'),' s')} | {fmt(t['dotnet'].get('rss_mb'),' MB',0)} | {fmt(t['go'].get('rss_mb'),' MB',0)} | {fmt(cpu('dotnet'),' s')} | {fmt(cpu('go'),' s')} | {n['dotnet']} | {n['go']} | {verdict} |")
    if notes: details.append((d, notes))
lines.append("")
# startup + size
def startup(k):
    try:
        vals = [float(x) for x in open(f"{S}/startup-{k}.txt").read().split()]
        return vals[-1] / 5 * 1000
    except Exception: return None
sizes = {}
try:
    for line in open(f"{S}/sizes.txt"):
        sz, p = line.split(); sizes[p] = int(sz) / 1048576
except Exception: pass
lines.append("| Geral | .NET | Go |")
lines.append("|---|---|---|")
lines.append(f"| Tempo de start do processo (`version`, média de 5) | {fmt(startup('dotnet'),' ms',0)} | {fmt(startup('go'),' ms',0)} |")
dn_pub = next((v for p, v in sizes.items() if "publish/linux-x64" in p), None)
go_bin = next((v for p, v in sizes.items() if "sdz-agent-go/bin" in p), None)
lines.append(f"| Binário Linux (single-file, self-contained) | {fmt(dn_pub,' MB',0)} | {fmt(go_bin,' MB',0)} |")
lines.append(f"| Instalador Windows (setup.exe) | 85 MB | 33 MB (16 MB sem o Mesa) |")
lines.append("")
if details:
    lines.append("## Diferenças encontradas nas saídas\n")
    for d, notes in details:
        lines.append(f"- **{d}**: " + "; ".join(notes))
    lines.append("")
lines.append("## Como ler\n")
lines.append("- Tempo inclui a extração completa: autenticação, download da setting, consultas paginadas, gravação dos JSON e envio para a API dev (o envio domina o tempo e varia com a rede).")
lines.append("- Pico de RAM = *maximum resident set size* do processo (ODBC: maior leitura do `docker stats` com amostra de 1 s).")
lines.append("- \"Saídas idênticas\" = mesmas linhas, mesmas colunas na mesma ordem e mesmos valores serializados nos `raw-*.json` dos dois agentes.")
open(f"{S}/comparativo.md", "w").write("\n".join(lines) + "\n")
print("\n".join(lines))
