import { readFileSync } from "fs";
import { createRequire } from "module";
const require = createRequire(import.meta.url);

// Load dotenv
const dotenv = require("dotenv");
dotenv.config();

const XLSX = require("xlsx");
const mysql = require("mysql2/promise");

const DB_URL = process.env.DATABASE_URL;
if (!DB_URL) {
  console.error("DATABASE_URL not set");
  process.exit(1);
}

async function main() {
  // Parse the catalog Excel file
  const filePath = "/home/ubuntu/upload/ASX_CATALOGO_BASE_COM_PRECO_MINIMO_61.xlsx";
  console.log("Reading Excel:", filePath);
  
  const wb = XLSX.readFile(filePath);
  const sheetName = wb.SheetNames[0];
  const ws = wb.Sheets[sheetName];
  const rawData = XLSX.utils.sheet_to_json(ws, { header: 1, defval: "" });
  
  console.log("Total rows:", rawData.length);
  console.log("Headers:", rawData[0]);
  
  // Find header row
  let headerRow = 0;
  for (let i = 0; i < Math.min(10, rawData.length); i++) {
    const row = rawData[i];
    const rowStr = row.join(" ").toUpperCase();
    if (rowStr.includes("CODIGO") || rowStr.includes("CÓDIGO") || rowStr.includes("COD")) {
      headerRow = i;
      break;
    }
  }
  
  const headers = rawData[headerRow].map(h => String(h).trim().toLowerCase()
    .normalize("NFD").replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]/g, "_")
  );
  console.log("Normalized headers:", headers);
  
  const products = [];
  for (let i = headerRow + 1; i < rawData.length; i++) {
    const row = rawData[i];
    if (!row || row.every(c => !c)) continue;
    
    const obj = {};
    headers.forEach((h, idx) => { obj[h] = row[idx] ?? ""; });
    
    // Try to find codigo and descricao
  // Known columns: codigo_asx, descricao, unid, caixa, volt, preco_venda_asx, ncm, ean, map_61_sobre_preco_asx, status_base
  const codigoKey = headers.find(h => h.includes("codigo") || h.includes("cod")) || "codigo_asx";
  const descKey = headers.find(h => h.includes("desc")) || "descricao";
  const custoKey = headers.find(h => h.includes("venda_asx") || h.includes("preco_venda") || h.includes("custo") || h.includes("compra")) || "preco_venda_asx";
  const minimoKey = headers.find(h => h.includes("map") || h.includes("minimo") || h.includes("min_")) || "map_61_sobre_preco_asx";
  const margemKey = headers.find(h => h.includes("margem") || h.includes("markup"));
    
    const codigo = String(obj[codigoKey] || "").trim();
    const descricao = String(obj[descKey] || "").trim();
    
    if (!codigo || !descricao || codigo === "CODIGO_ASX" || codigo === "COD") continue;
    
    let precoCusto = parseFloat(String(obj[custoKey] || "0").replace(",", ".").replace(/[^0-9.]/g, "")) || 0;
    let precoMinimo = parseFloat(String(obj[minimoKey] || "0").replace(",", ".").replace(/[^0-9.]/g, "")) || 0;
    let margemPercent = parseFloat(String(obj[margemKey || ""] || "60").replace(",", ".").replace(/[^0-9.]/g, "")) || 60;
    
    if (precoCusto <= 0) continue;
    if (precoMinimo <= 0) precoMinimo = precoCusto * 1.60;
    
    products.push({
      codigo,
      descricao,
      ean: String(obj["ean"] || obj["codigo_barras"] || "").trim() || null,
      unidade: String(obj["unidade"] || obj["un"] || "").trim() || null,
      caixa: parseInt(String(obj["caixa"] || obj["qtd_caixa"] || "0")) || null,
      voltagem: String(obj["voltagem"] || obj["volt"] || "").trim() || null,
      ncm: String(obj["ncm"] || "").trim() || null,
      precoCusto: precoCusto.toFixed(2),
      precoMinimo: precoMinimo.toFixed(2),
      margemPercent: margemPercent.toFixed(2),
      statusBase: String(obj["status"] || "ATIVO").trim() || "ATIVO",
    });
  }
  
  console.log(`Parsed ${products.length} valid products`);
  if (products.length === 0) {
    console.error("No products found. Check the Excel structure.");
    process.exit(1);
  }
  
  // Connect to DB
  const conn = await mysql.createConnection(DB_URL);
  console.log("Connected to database");
  
  let imported = 0;
  let skipped = 0;
  
  for (const p of products) {
    try {
      await conn.execute(
        `INSERT INTO products (codigo, descricao, ean, unidade, caixa, voltagem, ncm, preco_custo, preco_minimo, margem_percent, status_base, ativo)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1)
         ON DUPLICATE KEY UPDATE
           descricao = VALUES(descricao),
           ean = VALUES(ean),
           preco_custo = VALUES(preco_custo),
           preco_minimo = VALUES(preco_minimo),
           margem_percent = VALUES(margem_percent),
           status_base = VALUES(status_base),
           updatedAt = NOW()`,
        [p.codigo, p.descricao, p.ean, p.unidade, p.caixa, p.voltagem, p.ncm, p.precoCusto, p.precoMinimo, p.margemPercent, p.statusBase]
      );
      imported++;
    } catch (e) {
      console.warn(`Skipped ${p.codigo}: ${e.message}`);
      skipped++;
    }
  }
  
  await conn.end();
  console.log(`\n✅ Import complete: ${imported} imported, ${skipped} skipped`);
  
  // Show sample
  console.log("\nSample products:");
  products.slice(0, 5).forEach(p => {
    console.log(`  ${p.codigo} | ${p.descricao.substring(0, 40)} | Custo: R$${p.precoCusto} | Mínimo: R$${p.precoMinimo}`);
  });
}

main().catch(e => { console.error(e); process.exit(1); });
