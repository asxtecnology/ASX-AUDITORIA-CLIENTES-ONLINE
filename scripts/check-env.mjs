#!/usr/bin/env node
/**
 * check-env.mjs
 * Valida que todas as variáveis de ambiente obrigatórias estão definidas.
 * Em produção (NODE_ENV=production), falha com exit(1) se alguma estiver faltando.
 * Em desenvolvimento, apenas avisa no console.
 */

const REQUIRED_VARS = [
  { key: "DATABASE_URL", description: "PostgreSQL connection string (Supabase)" },
  { key: "JWT_SECRET", description: "Session cookie signing secret (min 32 chars)" },
  { key: "VITE_APP_ID", description: "Manus OAuth application ID" },
  { key: "OAUTH_SERVER_URL", description: "Manus OAuth backend base URL" },
  { key: "OWNER_OPEN_ID", description: "Owner's Manus Open ID" },
  { key: "BUILT_IN_FORGE_API_URL", description: "Manus built-in APIs URL" },
  { key: "BUILT_IN_FORGE_API_KEY", description: "Manus built-in APIs bearer token" },
];

const isProduction = process.env.NODE_ENV === "production";
const missing = [];

console.log("🔍 Checking required environment variables...\n");

for (const { key, description } of REQUIRED_VARS) {
  const value = process.env[key];
  if (!value || value.trim() === "") {
    missing.push({ key, description });
    console.error(`  ❌ ${key} — MISSING (${description})`);
  } else {
    // Mask sensitive values
    const masked =
      value.length > 8
        ? value.substring(0, 4) + "****" + value.substring(value.length - 4)
        : "****";
    console.log(`  ✅ ${key} = ${masked}`);
  }
}

// Extra validation: JWT_SECRET minimum length
const jwtSecret = process.env.JWT_SECRET;
if (jwtSecret && jwtSecret.length < 32) {
  console.error(
    `\n  ⚠️  JWT_SECRET is too short (${jwtSecret.length} chars). Minimum is 32 characters.`
  );
  missing.push({ key: "JWT_SECRET", description: "Must be at least 32 characters" });
}

// Extra validation: DATABASE_URL must be PostgreSQL
const dbUrl = process.env.DATABASE_URL;
if (dbUrl && !dbUrl.startsWith("postgresql://") && !dbUrl.startsWith("postgres://")) {
  console.error(
    `\n  ⚠️  DATABASE_URL does not look like a PostgreSQL URL. Expected postgresql:// or postgres://`
  );
  missing.push({ key: "DATABASE_URL", description: "Must be a PostgreSQL connection string" });
}

console.log("");

if (missing.length > 0) {
  const uniqueMissing = [...new Map(missing.map((m) => [m.key, m])).values()];
  console.error(
    `❌ ${uniqueMissing.length} environment variable(s) are missing or invalid:\n`
  );
  for (const { key, description } of uniqueMissing) {
    console.error(`   • ${key}: ${description}`);
  }
  console.error(
    "\n   📖 See .env.example for the full list of required variables.\n"
  );

  if (isProduction) {
    console.error("🚨 Production environment — exiting with error.\n");
    process.exit(1);
  } else {
    console.warn(
      "⚠️  Development environment — continuing despite missing variables.\n"
    );
  }
} else {
  console.log("✅ All required environment variables are set.\n");
}
