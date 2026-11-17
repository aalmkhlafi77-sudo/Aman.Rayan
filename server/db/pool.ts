import mysql, { type PoolConnection } from 'mysql2/promise';
import { serverEnv } from '../config/env';

export const pool = mysql.createPool({
  host: serverEnv.dbHost,
  port: serverEnv.dbPort,
  database: serverEnv.dbName,
  user: serverEnv.dbUser,
  password: serverEnv.dbPassword,
  connectionLimit: 10,
  waitForConnections: true,
  queueLimit: 0,
  charset: 'utf8mb4',
});

export async function withTransaction<T>(
  fn: (connection: PoolConnection) => Promise<T>
): Promise<T> {
  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction();
    const result = await fn(connection);
    await connection.commit();
    return result;
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }
}

export async function ensureSchema(): Promise<void> {
  const statements = [
    `CREATE TABLE IF NOT EXISTS owner_security (
      id TINYINT UNSIGNED NOT NULL,
      pin_salt VARCHAR(255) NOT NULL,
      pin_verifier TEXT NOT NULL,
      wrapped_master_key LONGTEXT NOT NULL,
      created_at DATETIME NOT NULL,
      updated_at DATETIME NOT NULL,
      PRIMARY KEY (id),
      CONSTRAINT one_owner CHECK (id = 1)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,
    `CREATE TABLE IF NOT EXISTS categories (
      id CHAR(36) NOT NULL,
      name VARCHAR(255) NOT NULL,
      created_at DATETIME NOT NULL,
      PRIMARY KEY (id)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,
    `CREATE TABLE IF NOT EXISTS vault_items (
      id CHAR(36) NOT NULL,
      title VARCHAR(255) NOT NULL,
      username TEXT NULL,
      email TEXT NULL,
      encrypted_password LONGTEXT NULL,
      encrypted_notes LONGTEXT NULL,
      urls_json LONGTEXT NULL,
      category_id CHAR(36) NULL,
      is_favorite BOOLEAN NOT NULL DEFAULT FALSE,
      encrypted_payload LONGTEXT NULL,
      created_at DATETIME NOT NULL,
      updated_at DATETIME NOT NULL,
      PRIMARY KEY (id),
      INDEX idx_vault_category (category_id),
      INDEX idx_vault_favorite (is_favorite),
      CONSTRAINT fk_vault_category
        FOREIGN KEY (category_id) REFERENCES categories(id)
        ON DELETE SET NULL
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,
    `CREATE TABLE IF NOT EXISTS audit_events (
      id CHAR(36) NOT NULL,
      action VARCHAR(64) NOT NULL,
      summary VARCHAR(512) NOT NULL,
      created_at DATETIME NOT NULL,
      PRIMARY KEY (id),
      INDEX idx_audit_created (created_at)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,
    `CREATE TABLE IF NOT EXISTS app_settings (
      id TINYINT UNSIGNED NOT NULL,
      auto_lock_minutes INT UNSIGNED NOT NULL DEFAULT 5,
      clipboard_clear_seconds INT UNSIGNED NOT NULL DEFAULT 20,
      updated_at DATETIME NOT NULL,
      PRIMARY KEY (id),
      CONSTRAINT one_settings_row CHECK (id = 1)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,
    `CREATE TABLE IF NOT EXISTS sessions (
      id VARCHAR(128) NOT NULL,
      csrf_token VARCHAR(128) NOT NULL,
      expires_at DATETIME NOT NULL,
      created_at DATETIME NOT NULL,
      PRIMARY KEY (id),
      INDEX idx_sessions_expires (expires_at)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,
  ];

  for (const sql of statements) {
    await pool.execute(sql);
  }
}

export function toSqlDateTime(date = new Date()): string {
  return date.toISOString().slice(0, 19).replace('T', ' ');
}
