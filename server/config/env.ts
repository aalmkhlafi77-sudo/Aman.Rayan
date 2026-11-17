import dotenv from 'dotenv';

dotenv.config();

export interface ServerEnvConfig {
  nodeEnv: string;
  isProduction: boolean;
  port: number;
  publicOrigin: string;
  dbHost: string;
  dbPort: number;
  dbName: string;
  dbUser: string;
  dbPassword: string;
  sessionSecret: string;
  amanBootstrapToken: string;
}

export const serverEnv: ServerEnvConfig = {
  nodeEnv: process.env.NODE_ENV || 'development',
  isProduction: process.env.NODE_ENV === 'production',
  port: Number(process.env.PORT || 3000),
  publicOrigin: process.env.PUBLIC_ORIGIN || '',
  dbHost: process.env.DB_HOST || '127.0.0.1',
  dbPort: Number(process.env.DB_PORT || 3306),
  dbName: process.env.DB_NAME || 'aman',
  dbUser: process.env.DB_USER || 'aman_app',
  dbPassword: process.env.DB_PASSWORD || '',
  sessionSecret: process.env.SESSION_SECRET || '',
  amanBootstrapToken: process.env.AMAN_BOOTSTRAP_TOKEN || '',
};

const PLACEHOLDER_SECRETS = new Set([
  'change_me',
  'changeme',
  'default',
  'secret',
  'password',
  'example',
  'my_secret',
]);

function isPlaceholderValue(value: string): boolean {
  const normalized = value.trim().toLowerCase();
  return !normalized || PLACEHOLDER_SECRETS.has(normalized) || normalized.includes('change_me');
}

export function validateProductionConfig(
  env: ServerEnvConfig,
  rawViteAppMode?: string
): void {
  if (!env.isProduction) {
    return;
  }

  const errors: string[] = [];

  if (!Number.isInteger(env.port) || env.port < 1 || env.port > 65535) {
    errors.push('PORT must be a valid TCP port (1-65535).');
  }

  if (!env.dbHost.trim()) {
    errors.push('DB_HOST must be set in production.');
  }
  if (!env.dbName.trim()) {
    errors.push('DB_NAME must be set in production.');
  }
  if (!env.dbUser.trim()) {
    errors.push('DB_USER must be set in production.');
  }
  if (isPlaceholderValue(env.dbPassword)) {
    errors.push('DB_PASSWORD must be configured with a non-placeholder value in production.');
  }

  if (isPlaceholderValue(env.sessionSecret) || env.sessionSecret.trim().length < 32) {
    errors.push('SESSION_SECRET must be at least 32 characters and not a placeholder value.');
  }

  if (!env.publicOrigin.trim()) {
    errors.push('PUBLIC_ORIGIN must be configured in production.');
  } else {
    try {
      const parsed = new URL(env.publicOrigin);
      if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
        errors.push('PUBLIC_ORIGIN must use http:// or https://.');
      }
      if (parsed.hostname.toLowerCase() === 'example.com' || parsed.hostname.toLowerCase().endsWith('.example.com')) {
        errors.push('PUBLIC_ORIGIN cannot use example.com placeholder in production.');
      }
    } catch {
      errors.push('PUBLIC_ORIGIN must be a valid URL.');
    }
  }

  if (rawViteAppMode !== undefined && rawViteAppMode !== '' && rawViteAppMode !== 'production') {
    errors.push(`VITE_APP_MODE in server environment must be "production" when defined (got "${rawViteAppMode}").`);
  }

  if (errors.length > 0) {
    throw new Error(`AMAN production configuration invalid:\n- ${errors.join('\n- ')}`);
  }
}
