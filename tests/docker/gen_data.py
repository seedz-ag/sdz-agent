#!/usr/bin/env python3
"""Gera dados fictícios determinísticos para as 8 tabelas do agent_mock e escreve
os scripts de seed de cada banco (schema.json vem da extração real do MySQL)."""
import json, random, os, re, sys, datetime as dt

HERE = os.path.dirname(os.path.abspath(__file__))
SEED = os.path.join(HERE, "seed")
os.makedirs(os.path.join(SEED, "mongo"), exist_ok=True)
random.seed(42)

ROWS = {"clientes": 1200, "itens_de_nota": 500, "notas": 400, "itens": 350,
        "itens_de_pedido": 600, "pedidos": 450, "contas_a_receber": 380, "vendedores": 120}

schema = json.load(open(os.path.join(HERE, "schema.json")))

def kind(col, inferred):
    n = col.lower()
    if n == "id": return "INT"
    if n in ("data_criacao", "data_atualizacao", "data_recebimento"): return "DATETIME"
    if n.startswith("data_") or n == "competencia": return "DATE"
    if n.startswith("valor_") or n.startswith("percentual"): return "DECIMAL"
    if n.startswith("quantidade") or n in ("parcela", "parcelas", "fator_conversao"): return "INT"
    return inferred if inferred in ("INT", "DECIMAL", "DATE", "DATETIME") else "VARCHAR"

WORDS = ["Agro", "Verde", "Campo", "Terra", "Sol", "Vale", "Serra", "Rio", "Norte", "Sul", "Safra", "Semente"]
FIRST = ["Ana", "Bruno", "Carla", "Diego", "Elisa", "Fabio", "Gisele", "Heitor", "Iara", "Joao", "Karen", "Luis"]
LAST = ["Silva", "Souza", "Oliveira", "Pereira", "Costa", "Rocha", "Almeida", "Nunes", "Lima", "Gomes"]
UFS = ["SP", "MG", "PR", "RS", "GO", "MT", "BA"]
def word(): return random.choice(WORDS)
def name(): return f"{random.choice(FIRST)} {random.choice(LAST)}"
def digits(n): return "".join(random.choice("0123456789") for _ in range(n))
def date(): return dt.date(2024, 1, 1) + dt.timedelta(days=random.randint(0, 650))
def datetime_(): return dt.datetime(2024, 1, 1) + dt.timedelta(seconds=random.randint(0, 650 * 86400))

def value(col, k, i):
    n = col.lower()
    if k == "INT": return i if n == "id" else random.randint(0, 500)
    if k == "DECIMAL": return round(random.uniform(0, 5000), 2)
    if k == "DATE": return date()
    if k == "DATETIME": return datetime_()
    if random.random() < 0.08: return None                      # NULLs de propósito
    if "cnpj" in n or n == "documento_empresa": return digits(14)
    if "cpf" in n or n.startswith("documento"): return digits(11)
    if "email" in n: return f"{random.choice(FIRST).lower()}{i}@{word().lower()}.example"
    if "telefone" in n or n == "celular": return f"(1{random.randint(1,9)}) 9{digits(4)}-{digits(4)}"
    if n in ("razao_social", "nome_fantasia", "nome_contato", "nome_vendedor", "nome_fornecedor"): return f"{name()} {word()} LTDA" if "razao" in n else name()
    if n in ("descricao", "descricao_item", "detalhe", "caracteristicas"): return f"{word()} {word()} {random.randint(1, 99)}"
    if n in ("uf", "estado"): return random.choice(UFS)
    if n == "cidade": return random.choice(["Ribeirão Preto", "Uberlândia", "Londrina", "Rondonópolis", "Passo Fundo"])
    if n == "sexo": return random.choice(["M", "F"])
    if n.startswith("id_") or n in ("numero", "serie", "titulo", "lote", "cep", "cep_cliente", "codigo_ibge", "rg"): return str(random.randint(1, 99999))
    if n.startswith("situacao") or n in ("tipo", "tipo_movimento", "regiao", "regiao_venda", "regiao_atendimento", "barter", "regra_negocio"): return random.choice(["1", "2", "A", "S", "E", "0"])
    if "codigo" in n: return digits(13)
    if n == "unidade_medida_item": return random.choice(["UN", "KG", "L", "SC"])
    if n == "hora": return f"{random.randint(0,23):02d}:{random.randint(0,59):02d}:00"
    return f"{word()} {random.randint(1, 999)}"

tables = {}
for table, cols in schema.items():
    spec = [(c["name"], kind(c["name"], c["type"])) for c in cols]
    rows = [[value(c, k, i) for c, k in spec] for i in range(1, ROWS[table] + 1)]
    tables[table] = (spec, rows)

# ---------------------------------------------------------------- SQL writers
def lit(v, k, dialect):
    if v is None: return "NULL"
    if k == "INT": return str(v)
    if k == "DECIMAL": return f"{v:.2f}"
    if k == "DATE":
        return f"DATE '{v.isoformat()}'" if dialect == "oracle" else f"'{v.isoformat()}'"
    if k == "DATETIME":
        s = v.strftime("%Y-%m-%d %H:%M:%S")
        return f"TIMESTAMP '{s}'" if dialect == "oracle" else f"'{s}'"
    s = str(v).replace("'", "''")
    return f"N'{s}'" if dialect == "mssql" else f"'{s}'"

TYPES = {
    "postgres": {"INT": "INTEGER", "DECIMAL": "NUMERIC(18,2)", "DATE": "DATE", "DATETIME": "TIMESTAMP", "VARCHAR": "VARCHAR(255)"},
    "mssql":    {"INT": "INT", "DECIMAL": "DECIMAL(18,2)", "DATE": "DATE", "DATETIME": "DATETIME2", "VARCHAR": "NVARCHAR(255)"},
    "oracle":   {"INT": "NUMBER(10)", "DECIMAL": "NUMBER(18,2)", "DATE": "DATE", "DATETIME": "TIMESTAMP", "VARCHAR": "VARCHAR2(255 CHAR)"},
    "firebird": {"INT": "INTEGER", "DECIMAL": "DECIMAL(18,2)", "DATE": "DATE", "DATETIME": "TIMESTAMP", "VARCHAR": "VARCHAR(255)"},
}

def write_sql(dialect):
    out = []
    pre = {"postgres": "DROP SCHEMA IF EXISTS agent_mock CASCADE;\nCREATE SCHEMA agent_mock;\n",
           "mssql": "IF DB_ID('agent_mock') IS NULL CREATE DATABASE agent_mock;\nGO\nUSE agent_mock;\nGO\nIF SCHEMA_ID('agent_mock') IS NULL EXEC('CREATE SCHEMA agent_mock');\nGO\n",
           "oracle": "", "firebird": ""}[dialect]
    out.append(pre)
    for table, (spec, rows) in tables.items():
        qualified = {"postgres": f"agent_mock.{table}", "mssql": f"agent_mock.{table}", "oracle": table, "firebird": table}[dialect]
        cols = list(spec)
        if dialect == "mssql":
            cols = cols + [("TIPOQUERY", "INT"), ("R_E_C_N_O_", "INT")]   # exigidos pela paginação do driver MSSQL sem ORDER BY
        if dialect == "mssql":
            out.append(f"IF OBJECT_ID('{qualified}') IS NOT NULL DROP TABLE {qualified};\nGO\n")
        elif dialect == "oracle":
            out.append(f"BEGIN EXECUTE IMMEDIATE 'DROP TABLE {table}'; EXCEPTION WHEN OTHERS THEN NULL; END;\n/\n")
        elif dialect == "firebird":
            out.append(f"SET TERM ^ ;\nEXECUTE BLOCK AS BEGIN IF (EXISTS(SELECT 1 FROM RDB$RELATIONS WHERE RDB$RELATION_NAME = '{table.upper()}')) THEN EXECUTE STATEMENT 'DROP TABLE {table}'; END^\nSET TERM ; ^\nCOMMIT;\n")
        ddl = ", ".join(f"{c} {TYPES[dialect][k]}" for c, k in cols)
        out.append(f"CREATE TABLE {qualified} ({ddl});\n" + ("GO\n" if dialect == "mssql" else "COMMIT;\n" if dialect == "firebird" else ""))
        colnames = ", ".join(c for c, _ in cols)
        batch = []
        for i, row in enumerate(rows, 1):
            vals = [lit(v, k, dialect) for v, (_, k) in zip(row, spec)]
            if dialect == "mssql": vals += ["1", str(i)]
            batch.append(f"INSERT INTO {qualified} ({colnames}) VALUES ({', '.join(vals)});")
            if dialect == "firebird" and i % 200 == 0: batch.append("COMMIT;")
        out.append("\n".join(batch) + "\n" + ("GO\n" if dialect == "mssql" else "COMMIT;\n"))
    if dialect == "oracle": out.append("COMMIT;\nEXIT;\n")
    open(os.path.join(SEED, f"{dialect}.sql"), "w", encoding="utf-8").write("".join(out))

for d in TYPES: write_sql(d)

# ---------------------------------------------------------------- Mongo (JSON por coleção, com tipos BSON)
def bson(v, k):
    if v is None: return None
    if k == "DATE": return {"$date": v.isoformat() + "T00:00:00Z"}
    if k == "DATETIME": return {"$date": v.strftime("%Y-%m-%dT%H:%M:%SZ")}
    if k == "DECIMAL": return {"$numberDecimal": f"{v:.2f}"}
    return v
for table, (spec, rows) in tables.items():
    docs = [{c: bson(v, k) for v, (c, k) in zip(row, spec)} for row in rows]
    json.dump(docs, open(os.path.join(SEED, "mongo", f"{table}.json"), "w", encoding="utf-8"), ensure_ascii=False)

print({t: len(r) for t, (_, r) in tables.items()})
