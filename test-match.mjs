import postgres from 'postgres';

const url = process.env.SUPABASE_URL;
const client = postgres(url, { ssl: 'require', max: 1 });

const rows = await client`SELECT id, codigo, descricao, ean, preco_minimo FROM products WHERE ativo = true ORDER BY codigo LIMIT 100`;

const catalog = rows.map(p => ({
  id: p.id,
  codigo: p.codigo,
  descricao: p.descricao,
  ean: p.ean,
  precoMinimo: p.preco_minimo,
}));

console.log(`Catalog loaded: ${catalog.length} products`);
console.log('Sample:', catalog[0]);

// Test matchProduct logic manually
const testTitles = [
  { title: 'Par De Ultra Led Asx 70w 10000 Lumens 6000k', price: 169 },
  { title: 'Par Ultra Led Asx 70w 10000 Lumens 6000k H1', price: 169 },
  { title: 'Ultra Led Com Chip Csp 70w/10.000lm 6000k Asx H4', price: 176.32 },
  { title: 'Par Lampada Ultra Led Plus Asx 12000 Lumens 80w H7', price: 220.99 },
  { title: 'Ultra Led Com Chip Csp 70w/10.000lm 6000k Asx H11', price: 169 },
  { title: 'Kit Lampada Ultra Led Plus 80w 6000k 12000lumens', price: 210 },
];

const PRODUCT_LINES = ['ULTRA LED CSP', 'ULTRA LED PLUS', 'ULTRA LED', 'SUPER LED', 'WORKLIGHT', 'XENON', 'ECO PLUGIN'];
const CONNECTORS = ['HIR2', 'HB3', 'HB4', 'H27', 'H16', 'H15', 'H13', 'H11', 'H9', 'H8', 'H7', 'H4', 'H3', 'H1'];

for (const { title, price } of testTitles) {
  const upper = title.toUpperCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
  const hasASX = upper.includes('ASX');
  const foundLine = PRODUCT_LINES.find(l => upper.includes(l));
  const foundConnector = CONNECTORS.find(c => new RegExp(`\\b${c}\\b`).test(upper));
  const wattMatch = upper.match(/\b(\d{2,3})\s*W\b/);
  const watt = wattMatch ? wattMatch[1] : null;
  const cleanUpper = upper.replace(/\./g, '');
  const lumensMatch = cleanUpper.match(/\b(\d{4,6})\s*LUMENS?\b/i);
  const lumens = lumensMatch ? lumensMatch[1] : null;

  let matchResult = null;

  // Step 1: Código ASX exato
  for (const prod of catalog) {
    if (upper.includes(prod.codigo.toUpperCase())) {
      matchResult = { ...prod, confianca: 100, method: 'codigo' };
      break;
    }
  }

  // Step 2: Line + Connector + Wattage
  if (!matchResult && foundLine && foundConnector) {
    const m = catalog.find(p => {
      const d = p.descricao.toUpperCase();
      const wattOk = !watt || new RegExp(`\\b${watt}\\s*W\\b`).test(d);
      return d.includes(foundLine) && new RegExp(`\\b${foundConnector}\\b`).test(d) && wattOk;
    });
    if (m) matchResult = { ...m, confianca: 95, method: 'linha_bulbo_watts' };
  }

  // Step 3: Line + Connector (no watt)
  if (!matchResult && foundLine && foundConnector) {
    const m = catalog.find(p => {
      const d = p.descricao.toUpperCase();
      return d.includes(foundLine) && new RegExp(`\\b${foundConnector}\\b`).test(d);
    });
    if (m) matchResult = { ...m, confianca: 85, method: 'linha_bulbo' };
  }

  // Step 4: Connector + Watt
  if (!matchResult && foundConnector && watt) {
    const m = catalog.find(p => {
      const d = p.descricao.toUpperCase();
      return new RegExp(`\\b${foundConnector}\\b`).test(d) && new RegExp(`\\b${watt}\\s*W\\b`).test(d);
    });
    if (m) matchResult = { ...m, confianca: 80, method: 'bulbo_watts' };
  }

  // Step 5: Line + Wattage (pick lowest precoMinimo)
  if (!matchResult && foundLine && watt) {
    const candidates = catalog.filter(p => {
      const d = p.descricao.toUpperCase();
      return d.includes(foundLine) && new RegExp(`\\b${watt}\\s*W\\b`).test(d);
    });
    if (candidates.length > 0) {
      const m = candidates.reduce((a, b) => Number(a.precoMinimo) <= Number(b.precoMinimo) ? a : b);
      matchResult = { ...m, confianca: 65, method: 'linha_watts' };
    }
  }

  // Step 6: Watt + Lumens
  if (!matchResult && watt && lumens) {
    const candidates = catalog.filter(p => new RegExp(`\\b${watt}\\s*W\\b`).test(p.descricao.toUpperCase()));
    if (candidates.length > 0) {
      const m = candidates.reduce((a, b) => Number(a.precoMinimo) <= Number(b.precoMinimo) ? a : b);
      matchResult = { ...m, confianca: 60, method: 'watts_lumens' };
    }
  }

  if (matchResult) {
    const precoMin = Number(matchResult.precoMinimo);
    const isViolation = price < precoMin;
    console.log(`✅ MATCH: ${title.substring(0, 45)}`);
    console.log(`   → ${matchResult.codigo} | ${matchResult.descricao.substring(0, 45)}`);
    console.log(`   → PrecoMin: R$${precoMin} | Price: R$${price} | VIOLATION: ${isViolation}`);
    console.log(`   → Method: ${matchResult.method} | Confianca: ${matchResult.confianca}`);
  } else {
    console.log(`❌ NO MATCH: ${title}`);
    console.log(`   hasASX: ${hasASX} | line: ${foundLine} | connector: ${foundConnector} | watt: ${watt} | lumens: ${lumens}`);
  }
  console.log('');
}

await client.end();
