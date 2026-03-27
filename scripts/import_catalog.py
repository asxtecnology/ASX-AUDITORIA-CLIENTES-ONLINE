"""
Script de importação do catálogo ASX para o Supabase PostgreSQL.
Lê o arquivo ASX_CATALOGO_BASE_COM_PRECO_MINIMO_61.xlsx e insere os produtos.
"""
import openpyxl
import psycopg2
import psycopg2.extras
import sys
from decimal import Decimal

# Conexão Supabase (pooler)
DB_URL = "postgresql://postgres.qmmgureyatsgjafjlrxe:Bob%40%232024%40%23%23@aws-0-us-west-2.pooler.supabase.com:6543/postgres"
# Decodificar a URL manualmente
DB_HOST = "aws-0-us-west-2.pooler.supabase.com"
DB_PORT = 6543
DB_NAME = "postgres"
DB_USER = "postgres.qmmgureyatsgjafjlrxe"
DB_PASS = "Bob@#2024@##"

XLSX_PATH = "/home/ubuntu/upload/ASX_CATALOGO_BASE_COM_PRECO_MINIMO_61.xlsx"

def categorizar(descricao: str, preco_custo: float) -> tuple[str, str]:
    upper = descricao.upper()
    categoria = "OUTROS"
    if "ULTRA LED" in upper: categoria = "ULTRA LED"
    elif "SUPER LED" in upper: categoria = "SUPER LED"
    elif "WORKLIGHT" in upper or "WORK LIGHT" in upper: categoria = "WORKLIGHT"
    elif "CHICOTE" in upper: categoria = "CHICOTE"
    elif "XENON" in upper: categoria = "XENON"
    elif "LAMPADA" in upper or "LÂMPADA" in upper: categoria = "LAMPADA"
    elif "LED" in upper: categoria = "LED"
    custo = float(preco_custo or 0)
    linha = "PREMIUM" if custo >= 100 else ("PLUS" if custo >= 40 else "ECO")
    return categoria, linha

def main():
    print("Conectando ao Supabase...")
    conn = psycopg2.connect(
        host=DB_HOST, port=DB_PORT, dbname=DB_NAME,
        user=DB_USER, password=DB_PASS, sslmode="require"
    )
    cur = conn.cursor()

    print(f"Lendo {XLSX_PATH}...")
    wb = openpyxl.load_workbook(XLSX_PATH)
    ws = wb.active

    # Cabeçalho: CODIGO_ASX, DESCRICAO, UNID, CAIXA, VOLT, PRECO_VENDA_ASX, NCM, EAN, MAP_61_SOBRE_PRECO_ASX, STATUS_BASE
    rows = list(ws.iter_rows(values_only=True))
    header = rows[0]
    print(f"Colunas: {header}")
    print(f"Total de linhas de dados: {len(rows) - 1}")

    inserted = 0
    updated = 0
    skipped = 0

    for i, row in enumerate(rows[1:], start=2):
        codigo, descricao, unidade, caixa, voltagem, preco_custo, ncm, ean, preco_minimo, status_base = row

        if not codigo or not descricao:
            skipped += 1
            continue

        codigo = str(codigo).strip()
        descricao = str(descricao).strip()
        preco_custo_val = float(preco_custo) if preco_custo else 0.0
        preco_minimo_val = float(preco_minimo) if preco_minimo else round(preco_custo_val * 1.61, 2)
        margem = round(((preco_minimo_val / preco_custo_val) - 1) * 100, 2) if preco_custo_val > 0 else 61.0
        # EAN: apenas números válidos (8-20 dígitos), ignorar textos como 'ATUALIZAR CÓD. DE BARRAS'
        ean_raw = str(ean).strip() if ean else ""
        ean_str = ean_raw if ean_raw.isdigit() and 8 <= len(ean_raw) <= 20 else None
        ncm_str = str(ncm).strip() if ncm else None
        unidade_str = str(unidade).strip() if unidade else "KIT"
        # caixa é integer no banco
        caixa_val = None
        if caixa:
            try: caixa_val = int(caixa)
            except: caixa_val = None
        voltagem_str = str(voltagem).strip() if voltagem else None
        status_str = str(status_base).strip() if status_base else "OK"
        ativo = status_str.upper() == "OK"
        categoria, linha = categorizar(descricao, preco_custo_val)

        # Upsert por codigo
        cur.execute("""
            INSERT INTO products (
                codigo, descricao, ean, unidade, caixa, voltagem, ncm,
                preco_custo, preco_minimo, margem_percent, status_base,
                categoria, linha, ativo, "createdAt", "updatedAt"
            ) VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, NOW(), NOW())
            ON CONFLICT (codigo) DO UPDATE SET
                descricao = EXCLUDED.descricao,
                ean = EXCLUDED.ean,
                preco_custo = EXCLUDED.preco_custo,
                preco_minimo = EXCLUDED.preco_minimo,
                margem_percent = EXCLUDED.margem_percent,
                status_base = EXCLUDED.status_base,
                categoria = EXCLUDED.categoria,
                linha = EXCLUDED.linha,
                ativo = EXCLUDED.ativo,
                "updatedAt" = NOW()
        """, (
            codigo, descricao, ean_str, unidade_str, caixa_val, voltagem_str, ncm_str,
            preco_custo_val, preco_minimo_val, margem, status_str,
            categoria, linha, ativo
        ))

        if cur.rowcount == 1:
            inserted += 1
        else:
            updated += 1

    conn.commit()
    cur.close()
    conn.close()

    print(f"\n✅ Importação concluída!")
    print(f"   Inseridos: {inserted}")
    print(f"   Atualizados: {updated}")
    print(f"   Ignorados: {skipped}")
    print(f"   Total processados: {inserted + updated}")

if __name__ == "__main__":
    main()
