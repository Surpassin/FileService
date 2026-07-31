import sql from 'mssql';

let pool: sql.ConnectionPool | null = null;

function parseConnectionString(connStr: string): sql.config {
  const parts: Record<string, string> = {};
  connStr.split(';').forEach(part => {
    const [key, ...valueParts] = part.split('=');
    if (key && valueParts.length > 0) {
      parts[key.trim().toLowerCase()] = valueParts.join('=').trim();
    }
  });

  return {
    server: parts['server'] || parts['data source'] || '',
    database: parts['database'] || parts['initial catalog'] || '',
    user: parts['user id'] || parts['uid'] || '',
    password: parts['password'] || parts['pwd'] || '',
    options: {
      encrypt: parts['encrypt']?.toLowerCase() !== 'false',
      trustServerCertificate: parts['trustservercertificate']?.toLowerCase() === 'true',
    },
    // Large writes (e.g. contract PDFs) need more than the 15s default
    requestTimeout: 120000,
    connectionTimeout: 30000,
  };
}

export async function getPool(): Promise<sql.ConnectionPool> {
  if (pool) return pool;

  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    throw new Error('DATABASE_URL environment variable is not set');
  }

  const config = parseConnectionString(connectionString);
  pool = await new sql.ConnectionPool(config).connect();
  return pool;
}

export async function initializeDatabase(): Promise<void> {
  const db = await getPool();

  await db.request().query(`
    IF NOT EXISTS (SELECT * FROM sys.tables WHERE name = 'users')
    CREATE TABLE users (
      id UNIQUEIDENTIFIER PRIMARY KEY DEFAULT NEWID(),
      email NVARCHAR(255) NOT NULL UNIQUE,
      name NVARCHAR(255) NOT NULL,
      password_hash NVARCHAR(255) NOT NULL,
      role NVARCHAR(50) NOT NULL DEFAULT 'user',
      created_at DATETIME2 NOT NULL DEFAULT GETUTCDATE(),
      updated_at DATETIME2 NOT NULL DEFAULT GETUTCDATE(),
      last_login_at DATETIME2 NULL
    )
  `);

  await db.request().query(`
    IF NOT EXISTS (SELECT * FROM sys.tables WHERE name = 'agents')
    CREATE TABLE agents (
      id UNIQUEIDENTIFIER PRIMARY KEY DEFAULT NEWID(),
      name NVARCHAR(255) NOT NULL,
      description NVARCHAR(MAX),
      system_prompt NVARCHAR(MAX),
      model NVARCHAR(100) NOT NULL DEFAULT 'claude-sonnet-4-6',
      config NVARCHAR(MAX) NOT NULL DEFAULT '{}',
      status NVARCHAR(50) NOT NULL DEFAULT 'idle',
      owner_id UNIQUEIDENTIFIER NOT NULL REFERENCES users(id),
      created_at DATETIME2 NOT NULL DEFAULT GETUTCDATE(),
      updated_at DATETIME2 NOT NULL DEFAULT GETUTCDATE()
    )
  `);

  await db.request().query(`
    IF NOT EXISTS (SELECT * FROM sys.tables WHERE name = 'conversations')
    CREATE TABLE conversations (
      id UNIQUEIDENTIFIER PRIMARY KEY DEFAULT NEWID(),
      agent_id UNIQUEIDENTIFIER NOT NULL REFERENCES agents(id),
      user_id UNIQUEIDENTIFIER NOT NULL REFERENCES users(id),
      title NVARCHAR(500),
      created_at DATETIME2 NOT NULL DEFAULT GETUTCDATE(),
      updated_at DATETIME2 NOT NULL DEFAULT GETUTCDATE()
    )
  `);

  await db.request().query(`
    IF NOT EXISTS (SELECT * FROM sys.tables WHERE name = 'messages')
    CREATE TABLE messages (
      id UNIQUEIDENTIFIER PRIMARY KEY DEFAULT NEWID(),
      conversation_id UNIQUEIDENTIFIER NOT NULL REFERENCES conversations(id),
      role NVARCHAR(50) NOT NULL,
      content NVARCHAR(MAX) NOT NULL,
      created_at DATETIME2 NOT NULL DEFAULT GETUTCDATE()
    )
  `);

  await db.request().query(`
    IF NOT EXISTS (SELECT * FROM sys.tables WHERE name = 'audit_log')
    CREATE TABLE audit_log (
      id UNIQUEIDENTIFIER PRIMARY KEY DEFAULT NEWID(),
      user_id UNIQUEIDENTIFIER NOT NULL REFERENCES users(id),
      action NVARCHAR(255) NOT NULL,
      entity_type NVARCHAR(255) NULL,
      entity_id UNIQUEIDENTIFIER NULL,
      details NVARCHAR(MAX) NULL,
      created_at DATETIME2 NOT NULL DEFAULT GETUTCDATE()
    )
  `);

  await db.request().query(`
    IF NOT EXISTS (SELECT * FROM sys.tables WHERE name = 'teams')
    CREATE TABLE teams (
      id UNIQUEIDENTIFIER PRIMARY KEY DEFAULT NEWID(),
      name NVARCHAR(255) NOT NULL,
      owner_id UNIQUEIDENTIFIER NOT NULL REFERENCES users(id),
      created_at DATETIME2 NOT NULL DEFAULT GETUTCDATE(),
      updated_at DATETIME2 NOT NULL DEFAULT GETUTCDATE()
    )
  `);

  await db.request().query(`
    IF NOT EXISTS (SELECT * FROM sys.tables WHERE name = 'team_members')
    CREATE TABLE team_members (
      id UNIQUEIDENTIFIER PRIMARY KEY DEFAULT NEWID(),
      team_id UNIQUEIDENTIFIER NOT NULL REFERENCES teams(id),
      user_id UNIQUEIDENTIFIER NOT NULL REFERENCES users(id),
      role NVARCHAR(50) NOT NULL DEFAULT 'member',
      created_at DATETIME2 NOT NULL DEFAULT GETUTCDATE(),
      UNIQUE(team_id, user_id)
    )
  `);

  // Add team_id to agents
  await db.request().query(`
    IF NOT EXISTS (SELECT * FROM sys.columns WHERE object_id = OBJECT_ID('agents') AND name = 'team_id')
    ALTER TABLE agents ADD team_id UNIQUEIDENTIFIER NULL REFERENCES teams(id)
  `);

  // Add visibility column to agents (private | team | selected)
  await db.request().query(`
    IF NOT EXISTS (SELECT * FROM sys.columns WHERE object_id = OBJECT_ID('agents') AND name = 'visibility')
    ALTER TABLE agents ADD visibility NVARCHAR(50) NOT NULL DEFAULT 'private'
  `);

  // Agent access table for per-user grants
  await db.request().query(`
    IF NOT EXISTS (SELECT * FROM sys.tables WHERE name = 'agent_access')
    CREATE TABLE agent_access (
      id UNIQUEIDENTIFIER PRIMARY KEY DEFAULT NEWID(),
      agent_id UNIQUEIDENTIFIER NOT NULL REFERENCES agents(id),
      user_id UNIQUEIDENTIFIER NOT NULL REFERENCES users(id),
      created_at DATETIME2 NOT NULL DEFAULT GETUTCDATE(),
      UNIQUE(agent_id, user_id)
    )
  `);

  // Add missing columns to existing tables
  await db.request().query(`
    IF NOT EXISTS (SELECT * FROM sys.columns WHERE object_id = OBJECT_ID('users') AND name = 'updated_at')
    ALTER TABLE users ADD updated_at DATETIME2 NOT NULL DEFAULT GETUTCDATE()
  `);

  await db.request().query(`
    IF NOT EXISTS (SELECT * FROM sys.columns WHERE object_id = OBJECT_ID('audit_log') AND name = 'entity_type')
    ALTER TABLE audit_log ADD entity_type NVARCHAR(255) NULL
  `);

  await db.request().query(`
    IF NOT EXISTS (SELECT * FROM sys.columns WHERE object_id = OBJECT_ID('audit_log') AND name = 'entity_id')
    ALTER TABLE audit_log ADD entity_id UNIQUEIDENTIFIER NULL
  `);
  
  // OAuth token storage for external integrations (e.g. Canva)
  await db.request().query(`
    IF NOT EXISTS (SELECT * FROM sys.tables WHERE name = 'integration_tokens')
    CREATE TABLE integration_tokens (
      provider NVARCHAR(50) PRIMARY KEY,
      access_token NVARCHAR(MAX) NOT NULL,
      refresh_token NVARCHAR(MAX) NOT NULL,
      expires_at DATETIME2 NOT NULL,
      updated_at DATETIME2 NOT NULL DEFAULT GETUTCDATE()
    )
  `);

  // Uploaded documents (e.g. contracts for review), stored per conversation
  await db.request().query(`
    IF NOT EXISTS (SELECT * FROM sys.tables WHERE name = 'contract_documents')
    CREATE TABLE contract_documents (
      id UNIQUEIDENTIFIER PRIMARY KEY DEFAULT NEWID(),
      conversation_id UNIQUEIDENTIFIER NOT NULL REFERENCES conversations(id),
      filename NVARCHAR(500) NOT NULL,
      media_type NVARCHAR(100) NOT NULL,
      content_base64 NVARCHAR(MAX) NOT NULL,
      uploaded_by UNIQUEIDENTIFIER NOT NULL REFERENCES users(id),
      uploaded_at DATETIME2 NOT NULL DEFAULT GETUTCDATE()
    )
  `);

  await db.request().query(`
    IF NOT EXISTS (SELECT * FROM sys.columns WHERE object_id = OBJECT_ID('contract_documents') AND name = 'extracted_text')
    ALTER TABLE contract_documents ADD extracted_text NVARCHAR(MAX) NULL
  `);

  await cleanupExpiredDocuments();
}

// Retention policy: uploaded contracts are kept for 90 days, then removed
export async function cleanupExpiredDocuments(): Promise<void> {
  try {
    const db = await getPool();
    const result = await db.request().query(
      `DELETE FROM contract_documents WHERE uploaded_at < DATEADD(day, -90, GETUTCDATE())`
    );
    const removed = result.rowsAffected?.[0] || 0;
    if (removed > 0) {
      console.log(`Document retention: removed ${removed} contract(s) older than 90 days`);
    }
  } catch (err: any) {
    console.error('Document retention cleanup failed:', err.message);
  }
}
