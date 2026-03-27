import postgres from "postgres";

const url = process.env.SUPABASE_URL;
if (!url) {
  console.error("SUPABASE_URL not set");
  process.exit(1);
}

const sql = postgres(url, { ssl: "require", max: 1 });

async function run() {
  try {
    console.log("Creating tracked_listings...");
    await sql`
      CREATE TABLE IF NOT EXISTS tracked_listings (
        id SERIAL PRIMARY KEY,
        ml_item_id VARCHAR(64) NOT NULL UNIQUE,
        ml_url TEXT NOT NULL,
        ml_title TEXT,
        ml_thumbnail TEXT,
        seller_id VARCHAR(64),
        seller_nickname VARCHAR(255),
        cliente_id INTEGER,
        matched_product_id INTEGER,
        matched_product_code VARCHAR(32),
        match_confidence INTEGER DEFAULT 0,
        match_method VARCHAR(64),
        listing_status VARCHAR(30) NOT NULL DEFAULT 'novo',
        last_checked_at TIMESTAMPTZ,
        last_price NUMERIC(10,2),
        last_violation_at TIMESTAMPTZ,
        consecutive_violations INTEGER DEFAULT 0,
        consecutive_ok INTEGER DEFAULT 0,
        total_checks INTEGER DEFAULT 0,
        source_ingestion_run_id INTEGER,
        source_snapshot_id INTEGER,
        promoted_at TIMESTAMPTZ,
        inactivated_at TIMESTAMPTZ,
        inactivation_reason VARCHAR(100),
        notes TEXT,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `;
    console.log("✓ tracked_listings created");

    console.log("Creating tracked_listing_checks...");
    await sql`
      CREATE TABLE IF NOT EXISTS tracked_listing_checks (
        id SERIAL PRIMARY KEY,
        tracked_listing_id INTEGER NOT NULL REFERENCES tracked_listings(id) ON DELETE CASCADE,
        run_id INTEGER,
        check_source VARCHAR(50) NOT NULL,
        observed_title TEXT,
        observed_price NUMERIC(12,2),
        observed_original_price NUMERIC(12,2),
        observed_currency VARCHAR(10) DEFAULT 'BRL',
        observed_available BOOLEAN,
        evidence_url TEXT,
        screenshot_url TEXT,
        html_snapshot_url TEXT,
        checked_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        violation_status VARCHAR(30),
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `;
    console.log("✓ tracked_listing_checks created");

    console.log("Creating match_review_queue...");
    await sql`
      CREATE TABLE IF NOT EXISTS match_review_queue (
        id SERIAL PRIMARY KEY,
        tracked_listing_id INTEGER NOT NULL REFERENCES tracked_listings(id) ON DELETE CASCADE,
        snapshot_id INTEGER,
        suggested_product_id INTEGER,
        confidence NUMERIC(5,2),
        reason VARCHAR(100) NOT NULL,
        status VARCHAR(30) NOT NULL DEFAULT 'pending',
        reviewed_by VARCHAR(255),
        reviewed_at TIMESTAMPTZ,
        decision_notes TEXT,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `;
    console.log("✓ match_review_queue created");

    // Also create ml_ingestion_runs and ml_listing_snapshots if not exist
    console.log("Creating ml_ingestion_runs if not exists...");
    await sql`
      CREATE TABLE IF NOT EXISTS ml_ingestion_runs (
        id SERIAL PRIMARY KEY,
        source VARCHAR(64) NOT NULL,
        source_version VARCHAR(32),
        cliente_id INTEGER,
        seller_nickname VARCHAR(255),
        seller_id VARCHAR(64),
        total_listings INTEGER DEFAULT 0,
        processed_listings INTEGER DEFAULT 0,
        violations_found INTEGER DEFAULT 0,
        status VARCHAR(20) NOT NULL DEFAULT 'pending',
        error_message TEXT,
        started_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        finished_at TIMESTAMPTZ,
        api_key_used VARCHAR(64)
      )
    `;
    console.log("✓ ml_ingestion_runs ensured");

    console.log("Creating ml_listing_snapshots if not exists...");
    await sql`
      CREATE TABLE IF NOT EXISTS ml_listing_snapshots (
        id SERIAL PRIMARY KEY,
        ingestion_run_id INTEGER NOT NULL,
        cliente_id INTEGER,
        seller_id VARCHAR(64),
        seller_nickname VARCHAR(255),
        ml_item_id VARCHAR(64) NOT NULL,
        ml_title TEXT NOT NULL,
        ml_url TEXT NOT NULL,
        ml_thumbnail TEXT,
        screenshot_url TEXT,
        price NUMERIC(10,2) NOT NULL,
        original_price NUMERIC(10,2),
        currency VARCHAR(8) DEFAULT 'BRL',
        matched_product_id INTEGER,
        matched_product_code VARCHAR(32),
        match_confidence INTEGER DEFAULT 0,
        match_method VARCHAR(64),
        preco_minimo NUMERIC(10,2),
        is_violation BOOLEAN DEFAULT FALSE,
        violation_id INTEGER,
        processed_at TIMESTAMPTZ,
        captured_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `;
    console.log("✓ ml_listing_snapshots ensured");

    // Verify all tables
    const tables = await sql`
      SELECT tablename FROM pg_tables 
      WHERE schemaname='public' 
      ORDER BY tablename
    `;
    console.log("\nAll tables:", tables.map(t => t.tablename).join(", "));
    console.log("\n✅ Migration complete!");
  } catch (e) {
    console.error("Error:", e.message);
    process.exit(1);
  } finally {
    await sql.end();
  }
}

run();
