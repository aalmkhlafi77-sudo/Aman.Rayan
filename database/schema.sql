-- AMAN (أمان) Production Database Schema — MySQL 8+ / MariaDB 10.5+
-- Safe idempotent DDL (does not drop or overwrite existing data)

CREATE TABLE IF NOT EXISTS owner_security (
  id TINYINT UNSIGNED NOT NULL,
  pin_salt VARCHAR(255) NOT NULL,
  pin_verifier TEXT NOT NULL,
  wrapped_master_key LONGTEXT NOT NULL,
  created_at DATETIME NOT NULL,
  updated_at DATETIME NOT NULL,
  PRIMARY KEY (id),
  CONSTRAINT one_owner CHECK (id = 1)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS categories (
  id CHAR(36) NOT NULL,
  name VARCHAR(255) NOT NULL,
  created_at DATETIME NOT NULL,
  PRIMARY KEY (id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS vault_items (
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
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS audit_events (
  id CHAR(36) NOT NULL,
  action VARCHAR(64) NOT NULL,
  summary VARCHAR(512) NOT NULL,
  created_at DATETIME NOT NULL,
  PRIMARY KEY (id),
  INDEX idx_audit_created (created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS app_settings (
  id TINYINT UNSIGNED NOT NULL,
  auto_lock_minutes INT UNSIGNED NOT NULL DEFAULT 5,
  clipboard_clear_seconds INT UNSIGNED NOT NULL DEFAULT 20,
  updated_at DATETIME NOT NULL,
  PRIMARY KEY (id),
  CONSTRAINT one_settings_row CHECK (id = 1)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS sessions (
  id VARCHAR(128) NOT NULL,
  csrf_token VARCHAR(128) NOT NULL,
  expires_at DATETIME NOT NULL,
  created_at DATETIME NOT NULL,
  PRIMARY KEY (id),
  INDEX idx_sessions_expires (expires_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS biometric_credentials (
  id CHAR(36) NOT NULL,
  owner_id TINYINT UNSIGNED NOT NULL DEFAULT 1,
  credential_id VARCHAR(512) NOT NULL,
  public_key LONGTEXT NOT NULL,
  sign_count BIGINT UNSIGNED NOT NULL DEFAULT 0,
  transports TEXT NULL,
  prf_input VARCHAR(255) NOT NULL,
  hkdf_salt VARCHAR(255) NOT NULL,
  wrapped_master_key LONGTEXT NOT NULL,
  device_type VARCHAR(32) NULL,
  backed_up BOOLEAN NOT NULL DEFAULT FALSE,
  created_at DATETIME NOT NULL,
  updated_at DATETIME NOT NULL,
  PRIMARY KEY (id),
  UNIQUE KEY uniq_biometric_credential_id (credential_id),
  INDEX idx_biometric_owner (owner_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS webauthn_challenges (
  id CHAR(36) NOT NULL,
  challenge VARCHAR(255) NOT NULL,
  operation ENUM('enroll', 'replace', 'authenticate') NOT NULL,
  session_id VARCHAR(128) NULL,
  prf_input VARCHAR(255) NULL,
  staged_credential_json LONGTEXT NULL,
  expires_at DATETIME NOT NULL,
  created_at DATETIME NOT NULL,
  PRIMARY KEY (id),
  UNIQUE KEY uniq_webauthn_challenge (challenge),
  INDEX idx_webauthn_expires (expires_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

