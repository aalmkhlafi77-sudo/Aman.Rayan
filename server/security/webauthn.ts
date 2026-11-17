import crypto from 'node:crypto';
import {
  generateAuthenticationOptions,
  generateRegistrationOptions,
  verifyAuthenticationResponse,
  verifyRegistrationResponse,
  type AuthenticationResponseJSON,
  type AuthenticatorTransportFuture,
  type CredentialDeviceType,
  type PublicKeyCredentialCreationOptionsJSON,
  type PublicKeyCredentialRequestOptionsJSON,
  type RegistrationResponseJSON,
  type VerifiedAuthenticationResponse,
  type VerifiedRegistrationResponse,
} from '@simplewebauthn/server';

export const WEBAUTHN_CHALLENGE_TTL_MS = 4 * 60 * 1000; // 4 minutes (within recommended 3-5 min window)
export const WEBAUTHN_OWNER_USER_ID = new Uint8Array(
  Buffer.from('aman-rayan-vault-owner-v1', 'utf8')
);

export function generatePrfInputBase64Url(): string {
  return crypto.randomBytes(32).toString('base64url');
}

export function generateChallengeBase64Url(): string {
  return crypto.randomBytes(32).toString('base64url');
}

export function isChallengeExpired(expiresAt: Date | string, now = Date.now()): boolean {
  const ts = expiresAt instanceof Date ? expiresAt.getTime() : new Date(expiresAt).getTime();
  return !Number.isFinite(ts) || ts <= now;
}

export function isValidBase64UrlToken(
  value: unknown,
  minLength = 16,
  maxLength = 512
): value is string {
  return (
    typeof value === 'string' &&
    value.length >= minLength &&
    value.length <= maxLength &&
    /^[A-Za-z0-9_-]+$/.test(value)
  );
}

export function parseTransportsJson(raw: string | null | undefined): AuthenticatorTransportFuture[] | undefined {
  if (!raw) return undefined;
  try {
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return undefined;
    const valid = parsed.filter(
      (item): item is AuthenticatorTransportFuture => typeof item === 'string' && item.length > 0
    );
    return valid.length > 0 ? valid : undefined;
  } catch {
    return undefined;
  }
}

export function sanitizeRegistrationResponse(
  input: unknown
): RegistrationResponseJSON | null {
  if (!input || typeof input !== 'object') return null;
  const obj = input as Record<string, unknown>;
  if (typeof obj.id !== 'string' || typeof obj.rawId !== 'string' || obj.type !== 'public-key') {
    return null;
  }
  if (!obj.response || typeof obj.response !== 'object') {
    return null;
  }
  const resp = obj.response as Record<string, unknown>;
  if (typeof resp.clientDataJSON !== 'string' || typeof resp.attestationObject !== 'string') {
    return null;
  }

  // Strip any raw PRF secret output if a faulty client ever included it
  const safeExtensions: Record<string, unknown> = {};
  if (obj.clientExtensionResults && typeof obj.clientExtensionResults === 'object') {
    const ext = obj.clientExtensionResults as Record<string, unknown>;
    if (ext.prf && typeof ext.prf === 'object') {
      const prfObj = ext.prf as Record<string, unknown>;
      safeExtensions.prf = {
        enabled: Boolean(prfObj.enabled),
      };
    }
  }

  return {
    id: obj.id,
    rawId: obj.rawId,
    type: 'public-key',
    response: {
      clientDataJSON: resp.clientDataJSON,
      attestationObject: resp.attestationObject,
      transports: Array.isArray(resp.transports)
        ? resp.transports.filter((t): t is AuthenticatorTransportFuture => typeof t === 'string')
        : undefined,
      publicKeyAlgorithm:
        typeof resp.publicKeyAlgorithm === 'number' ? resp.publicKeyAlgorithm : undefined,
      publicKey: typeof resp.publicKey === 'string' ? resp.publicKey : undefined,
      authenticatorData:
        typeof resp.authenticatorData === 'string' ? resp.authenticatorData : undefined,
    },
    clientExtensionResults: safeExtensions as RegistrationResponseJSON['clientExtensionResults'],
    authenticatorAttachment:
      obj.authenticatorAttachment === 'platform' || obj.authenticatorAttachment === 'cross-platform'
        ? obj.authenticatorAttachment
        : undefined,
  };
}

export function sanitizeAuthenticationResponse(
  input: unknown
): AuthenticationResponseJSON | null {
  if (!input || typeof input !== 'object') return null;
  const obj = input as Record<string, unknown>;
  if (typeof obj.id !== 'string' || typeof obj.rawId !== 'string' || obj.type !== 'public-key') {
    return null;
  }
  if (!obj.response || typeof obj.response !== 'object') {
    return null;
  }
  const resp = obj.response as Record<string, unknown>;
  if (
    typeof resp.clientDataJSON !== 'string' ||
    typeof resp.authenticatorData !== 'string' ||
    typeof resp.signature !== 'string'
  ) {
    return null;
  }

  // Strip any raw PRF secret output if a faulty client ever included it
  const safeExtensions: Record<string, unknown> = {};
  if (obj.clientExtensionResults && typeof obj.clientExtensionResults === 'object') {
    const ext = obj.clientExtensionResults as Record<string, unknown>;
    if (ext.prf && typeof ext.prf === 'object') {
      const prfObj = ext.prf as Record<string, unknown>;
      safeExtensions.prf = {
        enabled: Boolean(prfObj.enabled),
      };
    }
  }

  return {
    id: obj.id,
    rawId: obj.rawId,
    type: 'public-key',
    response: {
      clientDataJSON: resp.clientDataJSON,
      authenticatorData: resp.authenticatorData,
      signature: resp.signature,
      userHandle: typeof resp.userHandle === 'string' ? resp.userHandle : undefined,
    },
    clientExtensionResults: safeExtensions as AuthenticationResponseJSON['clientExtensionResults'],
    authenticatorAttachment:
      obj.authenticatorAttachment === 'platform' || obj.authenticatorAttachment === 'cross-platform'
        ? obj.authenticatorAttachment
        : undefined,
  };
}

export async function buildBiometricRegistrationOptions(params: {
  rpName: string;
  rpId: string;
  challenge: string;
  excludeCredentials?: { id: string; transports?: AuthenticatorTransportFuture[] }[];
}): Promise<PublicKeyCredentialCreationOptionsJSON> {
  return generateRegistrationOptions({
    rpName: params.rpName,
    rpID: params.rpId,
    userName: 'aman-rayan-owner',
    userDisplayName: 'مالك أمان ريان',
    userID: WEBAUTHN_OWNER_USER_ID,
    challenge: params.challenge,
    timeout: 90_000,
    attestationType: 'none',
    preferredAuthenticatorType: 'localDevice',
    excludeCredentials: params.excludeCredentials,
    authenticatorSelection: {
      authenticatorAttachment: 'platform',
      residentKey: 'preferred',
      userVerification: 'required',
    },
  });
}

export async function verifyBiometricRegistration(params: {
  response: RegistrationResponseJSON;
  expectedChallenge: string;
  expectedOrigin: string;
  expectedRpId: string;
}): Promise<VerifiedRegistrationResponse> {
  return verifyRegistrationResponse({
    response: params.response,
    expectedChallenge: params.expectedChallenge,
    expectedOrigin: params.expectedOrigin,
    expectedRPID: params.expectedRpId,
    requireUserPresence: true,
    requireUserVerification: true,
  });
}

export async function buildBiometricAuthenticationOptions(params: {
  rpId: string;
  challenge: string;
  allowCredentials: { id: string; transports?: AuthenticatorTransportFuture[] }[];
}): Promise<PublicKeyCredentialRequestOptionsJSON> {
  return generateAuthenticationOptions({
    rpID: params.rpId,
    challenge: params.challenge,
    timeout: 90_000,
    userVerification: 'required',
    allowCredentials: params.allowCredentials,
  });
}

export async function verifyBiometricAssertion(params: {
  response: AuthenticationResponseJSON;
  expectedChallenge: string;
  expectedOrigin: string;
  expectedRpId: string;
  credential: {
    id: string;
    publicKeyBase64: string;
    counter: number;
    transports?: AuthenticatorTransportFuture[];
  };
}): Promise<VerifiedAuthenticationResponse> {
  const publicKeyBytes = new Uint8Array(
    Buffer.from(params.credential.publicKeyBase64, 'base64')
  );
  return verifyAuthenticationResponse({
    response: params.response,
    expectedChallenge: params.expectedChallenge,
    expectedOrigin: params.expectedOrigin,
    expectedRPID: params.expectedRpId,
    requireUserVerification: true,
    credential: {
      id: params.credential.id,
      publicKey: publicKeyBytes,
      counter: params.credential.counter,
      transports: params.credential.transports,
    },
  });
}

export function extractVerifiedCredentialRecord(
  verification: Extract<VerifiedRegistrationResponse, { verified: true }>
): {
  credentialId: string;
  publicKeyBase64: string;
  signCount: number;
  transportsJson: string | null;
  deviceType: CredentialDeviceType;
  backedUp: boolean;
} {
  const { credential, credentialDeviceType, credentialBackedUp } = verification.registrationInfo;
  return {
    credentialId: credential.id,
    publicKeyBase64: Buffer.from(credential.publicKey).toString('base64'),
    signCount: Number(credential.counter) || 0,
    transportsJson:
      Array.isArray(credential.transports) && credential.transports.length > 0
        ? JSON.stringify(credential.transports)
        : null,
    deviceType: credentialDeviceType,
    backedUp: Boolean(credentialBackedUp),
  };
}
