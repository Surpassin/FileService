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
}
