import postgres from "postgres";

const url = process.env.SUPABASE_URL;
const client = postgres(url, { ssl: "require", max: 1 });

const PRODUCT_LINES = [
  "ULTRA LED CSP",
  "ULTRA LED PLUS",
  "ULTRA LED",
  "SUPER LED",
  "WORKLIGHT",
  "XENON",
  "ECO PLUGIN",
];

const CONNECTOR_PATTERNS = [
  "HIR2", "HB3", "HB4",
  "H27", "H16", "H15", "H13", "H11", "H9", "H8", "H7", "H4", "H3", "H1",
  "D1S", "D2S", "D3S", "D4S",
  "T15", "T10", "T5",
  "P21W", "W16W",
  "9012", "9006", "9005",
];

function extractWattage(t) {
  const m = t.match(/\b(\d{2,3})\s*W\b/);
  return m ? m[1] : null;
}

function extractLumens(t) {
  const c = t.replace(/\./g, "").normalize("NFD").replace(/[\u0300-\u036f]/g, "");
  const m = c.match(/\b(\d{4,6})\s*LUMENS?\b/i);
  return m ? m[1] : null;
}

function matchProduct(mlTitle, catalog) {
  const titleUpper = mlTitle.toUpperCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");

  // Step 1: ASX code
  for (const prod of catalog) {
    if (titleUpper.includes(prod.codigo.toUpperCase())) {
      return { ...prod, confianca: 100, method: "codigo" };
    }
  }

  if (!titleUpper.includes("ASX")) return null;

  const foundLine = PRODUCT_LINES.find((l) => titleUpper.includes(l));
  const foundConnector = CONNECTOR_PATTERNS.find((c) =>
    new RegExp(`\\b${c}\\b`).test(titleUpper)
  );
  const foundWattage = extractWattage(titleUpper);
  const foundLumens = extractLumens(titleUpper);

  function wattageMatches(d) {
    if (!foundWattage) return true;
    return new RegExp(`\\b${foundWattage}\\s*W\\b`).test(d.toUpperCase());
  }

  function lumensMatches(d) {
    if (!foundLumens) return true;
    const clean = d.replace(/\./g, "").normalize("NFD").replace(/[\u0300-\u036f]/g, "");
    return new RegExp(`\\b${foundLumens}\\s*LUMENS?\\b`, "i").test(clean);
  }

  // Step 2: Line + Connector + Wattage
  if (foundLine && foundConnector) {
    const m = catalog.find((p) => {
      const d = p.descricao.toUpperCase();
      return d.includes(foundLine) && new RegExp(`\\b${foundConnector}\\b`).test(d) && wattageMatches(d);
    });
    if (m) return { ...m, confianca: 95, method: "linha_bulbo_watts" };
    const mNoW = catalog.find((p) => {
      const d = p.descricao.toUpperCase();
      return d.includes(foundLine) && new RegExp(`\\b${foundConnector}\\b`).test(d);
    });
    if (mNoW) return { ...mNoW, confianca: 85, method: "linha_bulbo" };
  }

  // Step 3: Connector + Wattage
  if (foundConnector && foundWattage) {
    const m = catalog.find((p) => {
      const d = p.descricao.toUpperCase();
      return new RegExp(`\\b${foundConnector}\\b`).test(d) && wattageMatches(d);
    });
    if (m) return { ...m, confianca: 80, method: "bulbo_watts" };
  }

  // Step 4: Connector only
  if (foundConnector) {
    const m = catalog.find((p) =>
      new RegExp(`\\b${foundConnector}\\b`).test(p.descricao.toUpperCase())
    );
    if (m) return { ...m, confianca: 70, method: "bulbo" };
  }

  // Step 5: Line + Wattage
  if (foundLine && foundWattage) {
    const candidates = catalog.filter((p) => {
      const d = p.descricao.toUpperCase();
      return d.includes(foundLine) && wattageMatches(d);
    });
    if (candidates.length > 0) {
      const m = candidates.reduce((a, b) =>
        Number(a.precoMinimo) <= Number(b.precoMinimo) ? a : b
      );
      return { ...m, confianca: 65, method: "linha_watts", candidatesCount: candidates.length };
    }
  }

  // Step 6: Wattage + Lumens
  if (foundWattage && foundLumens) {
    const candidates = catalog.filter((p) => wattageMatches(p.descricao));
    if (candidates.length > 0) {
      const m = candidates.reduce((a, b) =>
        Number(a.precoMinimo) <= Number(b.precoMinimo) ? a : b
      );
      return { ...m, confianca: 60, method: "watts_lumens" };
    }
  }

  return null;
}

async function main() {
  const rows = await client`SELECT id, codigo, descricao, preco_minimo as "precoMinimo", ean FROM products WHERE ativo = true ORDER BY codigo`;
  const catalog = rows.map((r) => ({
    id: r.id,
    codigo: r.codigo,
    descricao: r.descricao,
    precoMinimo: r.precoMinimo,
    ean: r.ean,
  }));
  console.log("Total active products:", catalog.length);

  const testTitles = [
    "Par Ultra Led Asx 70w 10000 Lúmens 6000k 12/24v Automotiva",
    "Par Ultra Led Asx 70w 10000 Lúmens 6000k H4",
    "Ultra Led Com Chip Csp 70w/10.000lm 6000k Asx...",
    "Par Lâmpada Ultra Led Plus 80w 6000k 12000lumens...",
    "Kit Lâmpada Ultra Led Plus 80w 6000k 12000lumens...",
    "Ultra Led Com Chip Csp Asx 12000 Lúmens 80w...",
  ];

  for (const title of testTitles) {
    const result = matchProduct(title, catalog);
    const titleUpper = title.toUpperCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
    const foundLine = PRODUCT_LINES.find((l) => titleUpper.includes(l));
    const foundConnector = CONNECTOR_PATTERNS.find((c) => new RegExp(`\\b${c}\\b`).test(titleUpper));
    const foundWattage = extractWattage(titleUpper);
    const foundLumens = extractLumens(titleUpper);
    
    console.log(`\nTitle: "${title}"`);
    console.log(`  Parsed: line=${foundLine}, connector=${foundConnector}, watt=${foundWattage}, lumens=${foundLumens}`);
    if (result) {
      console.log(`  Match: ${result.codigo} | ${result.descricao?.substring(0,50)} | min=R$${result.precoMinimo} | conf=${result.confianca} | method=${result.method}`);
      if (result.candidatesCount) console.log(`  (from ${result.candidatesCount} candidates)`);
    } else {
      console.log(`  NO MATCH`);
    }
  }

  await client.end();
}

main().catch((e) => { console.error(e); process.exit(1); });
