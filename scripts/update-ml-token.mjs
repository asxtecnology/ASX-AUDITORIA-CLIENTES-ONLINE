/**
 * Script to update ML credentials with authorized token
 * Run: node scripts/update-ml-token.mjs
 */
import mysql from 'mysql2/promise';

// Token obtained via client_credentials grant
const ACCESS_TOKEN = 'APP_USR-3464765781004451-031216-60fc88a3fa6d9e4eb821fcec30692716-2952958609';
const ML_USER_ID = '2952958609';
const ML_NICKNAME = 'OUTLETDALUZ';
const ML_EMAIL = 'outletdaluz1@gmail.com';
const APP_ID = '3464765781004451';

// Expires in 6 hours from now
const expiresAt = new Date(Date.now() + 6 * 60 * 60 * 1000);

async function main() {
  const dbUrl = process.env.DATABASE_URL;
  if (!dbUrl) {
    console.error('DATABASE_URL not set');
    process.exit(1);
  }

  const conn = await mysql.createConnection(dbUrl);
  
  try {
    // Check current state
    const [rows] = await conn.execute('SELECT id, appId, status FROM ml_credentials WHERE appId = ?', [APP_ID]);
    console.log('Current records:', rows);
    
    if (rows.length === 0) {
      // Insert new record
      await conn.execute(`
        INSERT INTO ml_credentials 
          (appId, clientSecret, siteId, redirectUri, accessToken, tokenType, expiresAt, scope, mlUserId, mlNickname, mlEmail, status, createdAt, updatedAt)
        VALUES 
          (?, 'ldrPzqLlO1D5IrnDEMcDqd0qxgESEOss', 'MLB', 'https://asxmonitor-npfc3dsb.manus.space/ml', ?, 'Bearer', ?, 'offline_access read write', ?, ?, ?, 'authorized', NOW(), NOW())
      `, [APP_ID, ACCESS_TOKEN, expiresAt, ML_USER_ID, ML_NICKNAME, ML_EMAIL]);
      console.log('✅ Inserted new authorized record');
    } else {
      // Update existing record
      await conn.execute(`
        UPDATE ml_credentials 
        SET 
          accessToken = ?,
          tokenType = 'Bearer',
          expiresAt = ?,
          mlUserId = ?,
          mlNickname = ?,
          mlEmail = ?,
          scope = 'offline_access read write',
          status = 'authorized',
          lastError = NULL,
          updatedAt = NOW()
        WHERE appId = ?
      `, [ACCESS_TOKEN, expiresAt, ML_USER_ID, ML_NICKNAME, ML_EMAIL, APP_ID]);
      console.log('✅ Updated existing record to authorized');
    }
    
    // Verify
    const [updated] = await conn.execute('SELECT id, appId, status, mlNickname, expiresAt FROM ml_credentials WHERE appId = ?', [APP_ID]);
    console.log('Updated record:', updated[0]);
    
  } finally {
    await conn.end();
  }
}

main().catch(err => {
  console.error('Error:', err.message);
  process.exit(1);
});
