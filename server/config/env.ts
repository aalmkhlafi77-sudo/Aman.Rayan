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
  webauthnRpName: string;
  webauthnRpId: string;
  webauthnOrigin: string;
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
  webauthnRpName: (process.env.WEBAUTHN_RP_NAME || 'Aman Rayan').trim(),
  webauthnRpId: (process.env.WEBAUTHN_RP_ID || '').trim().toLowerCase(),
  webauthnOrigin: (process.env.WEBAUTHN_ORIGIN || '').trim(),
};

export interface WebAuthnRuntimeConfig {
  enabled: boolean;
  rpName: string;
  rpId: string;
  origin: string;
  diagnostic?: string;
}

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

function isPlaceholderHost(hostname: string): boolean {
  const lower = hostname.trim().toLowerCase();
  return (
    lower === 'example.com' ||
    lower.endsWith('.example.com') ||
    lower === 'localhost' ||
    lower.endsWith('.localhost') ||
    lower === '127.0.0.1' ||
    lower === '::1'
  );
}

function isValidRpIdFormat(rpId: string): boolean {
  if (!rpId || rpId.includes('*') || rpId.includes('/') || rpId.includes(':') || /\s/.test(rpId)) {
    return false;
  }
  return /^[a-z0-9.-]+$/.test(rpId);
}

export function validateWebAuthnProductionSettings(env: ServerEnvConfig): string[] {
  const errors: string[] = [];
  const hasAnyWebAuthnConfig = Boolean(env.webauthnRpId.trim() || env.webauthnOrigin.trim());

  if (!hasAnyWebAuthnConfig) {
    return errors;
  }

  if (!env.webauthnRpName.trim()) {
    errors.push('WEBAUTHN_RP_NAME must be configured when WebAuthn biometric unlock is enabled.');
  }

  const rpId = env.webauthnRpId.trim().toLowerCase();
  if (!isValidRpIdFormat(rpId)) {
    errors.push('WEBAUTHN_RP_ID must be a valid bare domain hostname without scheme, port, or wildcards.');
  } else if (isPlaceholderHost(rpId)) {
    errors.push('WEBAUTHN_RP_ID cannot use localhost or example.com placeholder in production.');
  }

  if (!env.webauthnOrigin.trim()) {
    errors.push('WEBAUTHN_ORIGIN must be configured in production when WEBAUTHN_RP_ID is set.');
  } else {
    try {
      const parsed = new URL(env.webauthnOrigin);
      if (parsed.protocol !== 'https:') {
        errors.push('WEBAUTHN_ORIGIN must use https:// in production.');
      }
      if (isPlaceholderHost(parsed.hostname)) {
        errors.push('WEBAUTHN_ORIGIN cannot use localhost or example.com placeholder in production.');
      }
      if (parsed.pathname !== '/' || parsed.search || parsed.hash) {
        errors.push('WEBAUTHN_ORIGIN must be an exact origin without path, query, or hash.');
      }
      if (
        isValidRpIdFormat(rpId) &&
        parsed.hostname.toLowerCase() !== rpId &&
        !parsed.hostname.toLowerCase().endsWith(`.${rpId}`)
      ) {
        errors.push('WEBAUTHN_ORIGIN hostname must match WEBAUTHN_RP_ID or be a subdomain of it.');
      }
    } catch {
      errors.push('WEBAUTHN_ORIGIN must be a valid https:// URL.');
    }
  }

  return errors;
}

export function resolveWebAuthnConfig(env: ServerEnvConfig): WebAuthnRuntimeConfig {
  const rpName = env.webauthnRpName.trim() || 'Aman Rayan';

  if (env.isProduction) {
    if (!env.webauthnRpId.trim() && !env.webauthnOrigin.trim()) {
      return {
        enabled: false,
        rpName,
        rpId: '',
        origin: '',
        diagnostic: 'WEBAUTHN_RP_ID / WEBAUTHN_ORIGIN غير مهيأة في بيئة الإنتاج.',
      };
    }

    const errors = validateWebAuthnProductionSettings(env);
    if (errors.length > 0) {
      return {
        enabled: false,
        rpName,
        rpId: '',
        origin: '',
        diagnostic: errors[0],
      };
    }

    const originUrl = new URL(env.webauthnOrigin);
    return {
      enabled: true,
      rpName,
      rpId: env.webauthnRpId.trim().toLowerCase(),
      origin: originUrl.origin,
    };
  }

  // Development / local non-production environment
  if (env.webauthnRpId.trim() && env.webauthnOrigin.trim()) {
    try {
      const originUrl = new URL(env.webauthnOrigin);
      return {
        enabled: true,
        rpName,
        rpId: env.webauthnRpId.trim().toLowerCase(),
        origin: originUrl.origin,
      };
    } catch {
      return {
        enabled: false,
        rpName,
        rpId: '',
        origin: '',
        diagnostic: 'WEBAUTHN_ORIGIN غير صالح.',
      };
    }
  }

  return {
    enabled: true,
    rpName,
    rpId: 'localhost',
    origin: `http://localhost:${env.port}`,
  };
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

  errors.push(...validateWebAuthnProductionSettings(env));

  if (rawViteAppMode !== undefined && rawViteAppMode !== '' && rawViteAppMode !== 'production') {
    errors.push(`VITE_APP_MODE in server environment must be "production" when defined (got "${rawViteAppMode}").`);
  }

  if (errors.length > 0) {
    throw new Error(`AMAN production configuration invalid:\n- ${errors.join('\n- ')}`);
  }
}
