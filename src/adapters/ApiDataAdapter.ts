import type {
  PublicKeyCredentialCreationOptionsJSON,
  PublicKeyCredentialRequestOptionsJSON,
} from '@simplewebauthn/browser';
import {
  performBiometricAuthentication,
  performBiometricEnrollment,
  zeroUint8Array,
  type StagedAssertionChallenge,
} from '../services/biometricAuth';
import { unwrapMasterKeyWithBiometricPrf } from '../services/crypto';
import type {
  AppSettings,
  AuditAction,
  AuditEvent,
  BiometricStatus,
  Category,
  CategoryInput,
  EncryptedVaultItem,
  EncryptedVaultItemInput,
  VaultSnapshot,
} from '../types/aman';
import type {
  AmanDataAdapter,
  AuthStatusResponse,
  BatchImportRequest,
  BatchImportResponse,
  UnlockResponse,
} from './AmanDataAdapter';

export class ApiDataAdapter implements AmanDataAdapter {
  private csrfToken = '';

  private async request<T>(url: string, init: RequestInit = {}): Promise<T> {
    const headers = new Headers(init.headers);
    if (!headers.has('Content-Type') && init.body) {
      headers.set('Content-Type', 'application/json');
    }
    if (this.csrfToken && init.method && init.method !== 'GET') {
      headers.set('X-CSRF-Token', this.csrfToken);
    }

    let response: Response;
    try {
      response = await fetch(url, {
        ...init,
        credentials: 'include',
        headers,
      });
    } catch {
      throw new Error('تعذر الحفظ على الخادم — تعذر الاتصال بخادم قاعدة البيانات');
    }

    const contentType = response.headers.get('content-type') || '';
    const payload = contentType.includes('application/json')
      ? await response.json().catch(() => ({}))
      : {};

    if (!response.ok) {
      const serverMessage =
        typeof (payload as { error?: unknown }).error === 'string'
          ? (payload as { error: string }).error
          : 'تعذر الحفظ على الخادم';
      throw new Error(serverMessage);
    }

    if (
      payload &&
      typeof payload === 'object' &&
      typeof (payload as { csrfToken?: unknown }).csrfToken === 'string'
    ) {
      this.csrfToken = (payload as { csrfToken: string }).csrfToken;
    }

    return payload as T;
  }

  async getAuthStatus(): Promise<AuthStatusResponse> {
    return this.request<AuthStatusResponse>('/api/auth/status', { method: 'GET' });
  }

  async setupOwner(
    pin: string,
    pinSalt: string,
    wrappedMasterKey: string,
    bootstrapToken?: string
  ): Promise<{ csrfToken?: string }> {
    const cleanToken = (bootstrapToken || '').trim();
    if (!cleanToken) {
      throw new Error('رمز التأسيس الأولي (Bootstrap Token) مطلوب في وضع الإنتاج');
    }
    return this.request<{ csrfToken?: string }>('/api/auth/setup', {
      method: 'POST',
      headers: {
        'X-AMAN-Bootstrap-Token': cleanToken,
      },
      body: JSON.stringify({ pin, pinSalt, wrappedMasterKey }),
    });
  }

  async unlock(pin: string): Promise<UnlockResponse> {
    return this.request<UnlockResponse>('/api/auth/unlock', {
      method: 'POST',
      body: JSON.stringify({ pin }),
    });
  }

  async lock(): Promise<void> {
    await this.request('/api/auth/lock', { method: 'POST' });
  }

  async logout(): Promise<void> {
    await this.request('/api/auth/logout', { method: 'POST' });
    this.csrfToken = '';
  }

  async changePin(
    currentPin: string,
    newPin: string,
    newPinSalt: string,
    newWrappedMasterKey: string
  ): Promise<void> {
    await this.request('/api/auth/change-pin', {
      method: 'POST',
      body: JSON.stringify({
        currentPin,
        newPin,
        newPinSalt,
        newWrappedMasterKey,
      }),
    });
  }

  async getBiometricStatus(): Promise<BiometricStatus> {
    return this.request<BiometricStatus>('/api/auth/biometric/status', { method: 'GET' });
  }

  private async runRegistrationFlow(
    operation: 'enroll' | 'replace',
    pin: string,
    masterKey: CryptoKey
  ): Promise<BiometricStatus> {
    const base = `/api/auth/biometric/${operation}`;
    const { options, prfInput } = await this.request<{
      options: PublicKeyCredentialCreationOptionsJSON;
      prfInput: string;
    }>(`${base}/options`, {
      method: 'POST',
      body: JSON.stringify({ pin }),
    });

    const enrollmentResult = await performBiometricEnrollment({
      options,
      prfInput,
      masterKey,
      onStageAssertion: (challenge, registrationResponse) =>
        this.request<StagedAssertionChallenge>(`${base}/stage`, {
          method: 'POST',
          body: JSON.stringify({ challenge, registrationResponse }),
        }),
    });

    if (enrollmentResult.mode === 'direct') {
      await this.request(`${base}/verify`, {
        method: 'POST',
        body: JSON.stringify({
          challenge: enrollmentResult.challenge,
          registrationResponse: enrollmentResult.registrationResponse,
          hkdfSalt: enrollmentResult.hkdfSalt,
          wrappedMasterKey: enrollmentResult.wrappedMasterKey,
        }),
      });
    } else {
      await this.request(`${base}/finalize`, {
        method: 'POST',
        body: JSON.stringify({
          challenge: enrollmentResult.challenge,
          authenticationResponse: enrollmentResult.authenticationResponse,
          hkdfSalt: enrollmentResult.hkdfSalt,
          wrappedMasterKey: enrollmentResult.wrappedMasterKey,
        }),
      });
    }

    return this.getBiometricStatus();
  }

  async enrollBiometric(pin: string, masterKey: CryptoKey): Promise<BiometricStatus> {
    return this.runRegistrationFlow('enroll', pin, masterKey);
  }

  async replaceBiometric(pin: string, masterKey: CryptoKey): Promise<BiometricStatus> {
    return this.runRegistrationFlow('replace', pin, masterKey);
  }

  async removeBiometric(pin: string): Promise<void> {
    await this.request('/api/auth/biometric/remove', {
      method: 'POST',
      body: JSON.stringify({ pin }),
    });
  }

  async unlockWithBiometric(): Promise<{ masterKey: CryptoKey }> {
    const { options, prfInput } = await this.request<{
      options: PublicKeyCredentialRequestOptionsJSON;
      prfInput: string;
    }>('/api/auth/biometric/options', {
      method: 'POST',
      body: JSON.stringify({}),
    });

    const assertion = await performBiometricAuthentication({ options, prfInput });
    try {
      const verifyResp = await this.request<{
        ok: boolean;
        hkdfSalt: string;
        prfInput: string;
        wrappedMasterKey: string;
        csrfToken?: string;
      }>('/api/auth/biometric/verify', {
        method: 'POST',
        body: JSON.stringify({
          challenge: assertion.challenge,
          authenticationResponse: assertion.authenticationResponse,
        }),
      });

      const masterKey = await unwrapMasterKeyWithBiometricPrf(
        verifyResp.wrappedMasterKey,
        assertion.prfOutputCopy,
        verifyResp.hkdfSalt
      );
      return { masterKey };
    } finally {
      zeroUint8Array(assertion.prfOutputCopy);
    }
  }

  async getVault(): Promise<VaultSnapshot> {
    return this.request<VaultSnapshot>('/api/vault', { method: 'GET' });
  }

  async createItem(item: EncryptedVaultItemInput): Promise<EncryptedVaultItem> {
    return this.request<EncryptedVaultItem>('/api/vault', {
      method: 'POST',
      body: JSON.stringify(item),
    });
  }

  async updateItem(id: string, item: EncryptedVaultItemInput): Promise<EncryptedVaultItem> {
    return this.request<EncryptedVaultItem>(`/api/vault/${encodeURIComponent(id)}`, {
      method: 'PUT',
      body: JSON.stringify(item),
    });
  }

  async deleteItem(id: string): Promise<void> {
    await this.request(`/api/vault/${encodeURIComponent(id)}`, {
      method: 'DELETE',
    });
  }

  async getCategories(): Promise<Category[]> {
    return this.request<Category[]>('/api/categories', { method: 'GET' });
  }

  async saveCategory(category: CategoryInput): Promise<Category> {
    return this.request<Category>('/api/categories', {
      method: 'POST',
      body: JSON.stringify(category),
    });
  }

  async deleteCategory(id: string): Promise<void> {
    await this.request(`/api/categories/${encodeURIComponent(id)}`, {
      method: 'DELETE',
    });
  }

  async batchImport(payload: BatchImportRequest): Promise<BatchImportResponse> {
    const endpoint =
      payload.source === 'aman_restore' ? '/api/restore' : '/api/vault/import';
    return this.request<BatchImportResponse>(endpoint, {
      method: 'POST',
      body: JSON.stringify(payload),
    });
  }

  async getAuditEvents(): Promise<AuditEvent[]> {
    return this.request<AuditEvent[]>('/api/audit', { method: 'GET' });
  }

  async recordAuditEvent(action: AuditAction, summary: string): Promise<void> {
    await this.request('/api/audit', {
      method: 'POST',
      body: JSON.stringify({ action, summary }),
    });
  }

  async saveSettings(settings: AppSettings): Promise<AppSettings> {
    return this.request<AppSettings>('/api/settings', {
      method: 'PUT',
      body: JSON.stringify(settings),
    });
  }

  async wipeVault(pin: string): Promise<void> {
    await this.request('/api/wipe', {
      method: 'POST',
      body: JSON.stringify({ pin }),
    });
    this.csrfToken = '';
  }
}
