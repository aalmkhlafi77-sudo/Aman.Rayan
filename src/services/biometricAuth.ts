import {
  base64URLStringToBuffer,
  browserSupportsWebAuthn,
  platformAuthenticatorIsAvailable,
  startAuthentication,
  startRegistration,
  WebAuthnError,
  type AuthenticationResponseJSON,
  type PublicKeyCredentialCreationOptionsJSON,
  type PublicKeyCredentialRequestOptionsJSON,
  type RegistrationResponseJSON,
} from '@simplewebauthn/browser';
import type { BiometricCapability } from '../types/aman';
import { generateSaltBase64, wrapMasterKeyWithBiometricPrf } from './crypto';

export const PRF_UNSUPPORTED_MESSAGE =
  'هذا الجهاز يدعم المصادقة البيومترية، لكنه لا يدعم حالياً فتح الخزنة المشفرة مباشرة. استخدم رمز PIN.';

export interface BiometricPrfResults {
  enabled?: boolean;
  results?: {
    first?: ArrayBuffer | Uint8Array;
    second?: ArrayBuffer | Uint8Array;
  };
}

export interface StagedAssertionChallenge {
  assertionOptions: PublicKeyCredentialRequestOptionsJSON;
  prfInput: string;
}

export type BiometricEnrollmentResult =
  | {
      mode: 'direct';
      challenge: string;
      registrationResponse: RegistrationResponseJSON;
      hkdfSalt: string;
      wrappedMasterKey: string;
    }
  | {
      mode: 'staged';
      challenge: string;
      authenticationResponse: AuthenticationResponseJSON;
      hkdfSalt: string;
      wrappedMasterKey: string;
    };

export interface BiometricAssertionResult {
  challenge: string;
  authenticationResponse: AuthenticationResponseJSON;
  prfOutputCopy: Uint8Array;
}

export function isWindowsPlatform(): boolean {
  if (typeof navigator === 'undefined') return false;
  const uaDataPlatform = (navigator as Navigator & { userAgentData?: { platform?: string } })
    .userAgentData?.platform;
  const platformStr = `${uaDataPlatform || ''} ${navigator.platform || ''} ${navigator.userAgent || ''}`;
  return /win/i.test(platformStr);
}

export function getBiometricButtonLabel(isWindows: boolean): string {
  return isWindows ? 'فتح بالبصمة / Windows Hello' : 'الدخول البيومتري';
}

export function zeroUint8Array(buf: Uint8Array | null | undefined): void {
  if (buf && buf.byteLength > 0) {
    buf.fill(0);
  }
}

function zeroArrayBuffer(buf: ArrayBuffer | Uint8Array | undefined): void {
  if (!buf) return;
  if (buf instanceof Uint8Array) {
    buf.fill(0);
  } else {
    new Uint8Array(buf).fill(0);
  }
}

export function sanitizeRegistrationForServer(
  resp: RegistrationResponseJSON
): RegistrationResponseJSON {
  const ext = (resp.clientExtensionResults || {}) as { prf?: BiometricPrfResults };
  return {
    ...resp,
    clientExtensionResults: (ext.prf
      ? { prf: { enabled: Boolean(ext.prf.enabled) } }
      : {}) as RegistrationResponseJSON['clientExtensionResults'],
  };
}

export function sanitizeAuthenticationForServer(
  resp: AuthenticationResponseJSON
): AuthenticationResponseJSON {
  const ext = (resp.clientExtensionResults || {}) as { prf?: BiometricPrfResults };
  return {
    ...resp,
    clientExtensionResults: (ext.prf
      ? { prf: { enabled: Boolean(ext.prf.enabled) } }
      : {}) as AuthenticationResponseJSON['clientExtensionResults'],
  };
}

export function mapBiometricError(err: unknown): {
  cancelled: boolean;
  message: string;
} {
  if (err instanceof WebAuthnError) {
    if (err.code === 'ERROR_CEREMONY_ABORTED' || err.name === 'NotAllowedError') {
      return {
        cancelled: true,
        message: 'تم إلغاء التحقق البيومتري. يمكنك المحاولة مرة أخرى أو استخدام رمز PIN.',
      };
    }
    if (err.code === 'ERROR_AUTHENTICATOR_MISSING_DISCOVERABLE_CREDENTIAL_SUPPORT') {
      return {
        cancelled: false,
        message: 'الدخول البيومتري غير متاح على هذا الجهاز. استخدم رمز PIN.',
      };
    }
  }

  if (err && typeof err === 'object' && 'name' in err) {
    const name = String((err as { name: unknown }).name);
    if (name === 'NotAllowedError' || name === 'AbortError') {
      return {
        cancelled: true,
        message: 'تم إلغاء التحقق البيومتري. يمكنك المحاولة مرة أخرى أو استخدام رمز PIN.',
      };
    }
    if (name === 'SecurityError') {
      return {
        cancelled: false,
        message: 'يتطلب الدخول البيومتري اتصالاً آمناً (HTTPS) ومطابقة النطاق.',
      };
    }
  }

  return {
    cancelled: false,
    message:
      err instanceof Error && err.message
        ? err.message
        : 'تعذر إتمام التحقق البيومتري. يمكنك المحاولة مرة أخرى أو استخدام رمز PIN.',
  };
}

export async function detectBiometricCapability(): Promise<BiometricCapability> {
  const isWindows = isWindowsPlatform();

  if (typeof window === 'undefined') {
    return {
      webAuthnAvailable: false,
      platformAuthenticatorAvailable: false,
      prfAvailable: false,
      secureContext: false,
      canEnableVaultUnlock: false,
      isWindows,
      reason: 'بيئة غير متصفحية',
    };
  }

  const secureContext = Boolean(window.isSecureContext);
  const webAuthnAvailable = browserSupportsWebAuthn();

  if (!secureContext || !webAuthnAvailable) {
    return {
      webAuthnAvailable,
      platformAuthenticatorAvailable: false,
      prfAvailable: false,
      secureContext,
      canEnableVaultUnlock: false,
      isWindows,
      reason: !secureContext
        ? 'يتطلب الدخول البيومتري سياقاً آمناً (HTTPS).'
        : 'المتصفح الحالي لا يدعم WebAuthn.',
    };
  }

  let platformAuthenticatorAvailable = false;
  try {
    platformAuthenticatorAvailable = await platformAuthenticatorIsAvailable();
  } catch {
    platformAuthenticatorAvailable = false;
  }

  let prfAvailable = platformAuthenticatorAvailable;
  try {
    const pkc = window.PublicKeyCredential as typeof PublicKeyCredential & {
      getClientCapabilities?: () => Promise<Record<string, boolean>>;
    };
    if (typeof pkc?.getClientCapabilities === 'function') {
      const caps = await pkc.getClientCapabilities();
      if (caps && typeof caps === 'object') {
        if ('extension:prf' in caps) {
          prfAvailable = Boolean(caps['extension:prf']);
        } else if ('prf' in caps) {
          prfAvailable = Boolean(caps.prf);
        }
      }
    }
  } catch {
    // Keep platformAuthenticatorAvailable result; strict PRF presence is verified during enrollment
  }

  const canEnableVaultUnlock =
    secureContext && webAuthnAvailable && platformAuthenticatorAvailable && prfAvailable;

  let reason: string | undefined;
  if (!platformAuthenticatorAvailable) {
    reason = 'الدخول البيومتري غير مدعوم على هذا الجهاز';
  } else if (!prfAvailable) {
    reason = PRF_UNSUPPORTED_MESSAGE;
  }

  return {
    webAuthnAvailable,
    platformAuthenticatorAvailable,
    prfAvailable,
    secureContext,
    canEnableVaultUnlock,
    isWindows,
    reason,
  };
}

function attachPrfExtension<T extends PublicKeyCredentialCreationOptionsJSON | PublicKeyCredentialRequestOptionsJSON>(
  options: T,
  prfInputBase64Url: string
): T {
  const firstBytes = new Uint8Array(base64URLStringToBuffer(prfInputBase64Url));
  const existingExtensions =
    options.extensions && typeof options.extensions === 'object' ? options.extensions : {};

  return {
    ...options,
    extensions: {
      ...existingExtensions,
      prf: {
        eval: {
          first: firstBytes,
        },
      },
    } as T['extensions'],
  };
}

function extractPrfOutputBytes(extResults: unknown): Uint8Array | null {
  if (!extResults || typeof extResults !== 'object') return null;
  const prf = (extResults as { prf?: BiometricPrfResults }).prf;
  const rawFirst = prf?.results?.first;
  if (!rawFirst) return null;
  const view = rawFirst instanceof Uint8Array ? rawFirst : new Uint8Array(rawFirst);
  if (view.byteLength < 16) return null;
  return new Uint8Array(view);
}

export async function performBiometricEnrollment(params: {
  options: PublicKeyCredentialCreationOptionsJSON;
  prfInput: string;
  masterKey: CryptoKey;
  onStageAssertion: (
    challenge: string,
    sanitizedRegistration: RegistrationResponseJSON
  ) => Promise<StagedAssertionChallenge>;
}): Promise<BiometricEnrollmentResult> {
  const optionsWithPrf = attachPrfExtension(params.options, params.prfInput);
  const rawResp = await startRegistration({ optionsJSON: optionsWithPrf });
  const sanitizedReg = sanitizeRegistrationForServer(rawResp);
  const ext = (rawResp.clientExtensionResults || {}) as { prf?: BiometricPrfResults };

  // Path 1: Authenticator evaluated PRF directly during credential creation
  const directPrf = extractPrfOutputBytes(rawResp.clientExtensionResults);
  if (directPrf) {
    try {
      const hkdfSalt = generateSaltBase64(16);
      const wrappedMasterKey = await wrapMasterKeyWithBiometricPrf(
        params.masterKey,
        directPrf,
        hkdfSalt
      );
      return {
        mode: 'direct',
        challenge: params.options.challenge,
        registrationResponse: sanitizedReg,
        hkdfSalt,
        wrappedMasterKey,
      };
    } finally {
      zeroUint8Array(directPrf);
      zeroArrayBuffer(ext.prf?.results?.first);
    }
  }

  // If browser/authenticator explicitly indicates PRF is NOT enabled, abort cleanly (no fallback escrow)
  if (!ext.prf?.enabled) {
    throw new Error(PRF_UNSUPPORTED_MESSAGE);
  }

  // Path 2: WebAuthn Level 3 browsers (e.g. Windows Hello) return prf.enabled=true on create()
  // and provide prf.results.first on immediate get() assertion before credential is committed.
  const staged = await params.onStageAssertion(params.options.challenge, sanitizedReg);
  const authOptionsWithPrf = attachPrfExtension(staged.assertionOptions, staged.prfInput);
  const authResp = await startAuthentication({ optionsJSON: authOptionsWithPrf });
  const authExt = (authResp.clientExtensionResults || {}) as { prf?: BiometricPrfResults };
  const stagedPrf = extractPrfOutputBytes(authResp.clientExtensionResults);

  if (!stagedPrf) {
    throw new Error(PRF_UNSUPPORTED_MESSAGE);
  }

  try {
    const hkdfSalt = generateSaltBase64(16);
    const wrappedMasterKey = await wrapMasterKeyWithBiometricPrf(
      params.masterKey,
      stagedPrf,
      hkdfSalt
    );
    return {
      mode: 'staged',
      challenge: staged.assertionOptions.challenge,
      authenticationResponse: sanitizeAuthenticationForServer(authResp),
      hkdfSalt,
      wrappedMasterKey,
    };
  } finally {
    zeroUint8Array(stagedPrf);
    zeroArrayBuffer(authExt.prf?.results?.first);
  }
}

export async function performBiometricAuthentication(params: {
  options: PublicKeyCredentialRequestOptionsJSON;
  prfInput: string;
}): Promise<BiometricAssertionResult> {
  const optionsWithPrf = attachPrfExtension(params.options, params.prfInput);
  const rawResp = await startAuthentication({ optionsJSON: optionsWithPrf });
  const ext = (rawResp.clientExtensionResults || {}) as { prf?: BiometricPrfResults };
  const prfOutputCopy = extractPrfOutputBytes(rawResp.clientExtensionResults);

  // Immediately clear original browser buffer copy; caller must zero prfOutputCopy after unwrap
  zeroArrayBuffer(ext.prf?.results?.first);

  if (!prfOutputCopy) {
    throw new Error(PRF_UNSUPPORTED_MESSAGE);
  }

  return {
    challenge: params.options.challenge,
    authenticationResponse: sanitizeAuthenticationForServer(rawResp),
    prfOutputCopy,
  };
}
