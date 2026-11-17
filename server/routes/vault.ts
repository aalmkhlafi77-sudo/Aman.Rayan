import crypto from 'node:crypto';
import { Router } from 'express';
import type { RowDataPacket } from 'mysql2/promise';
import { pool, toSqlDateTime, withTransaction } from '../db/pool';
import {
  createRateLimiter,
  requireCsrf,
  requireSession,
  SESSION_COOKIE_NAME,
  type AuthenticatedRequest,
} from '../middleware/security';
import {
  MAX_BATCH_CATEGORIES,
  MAX_BATCH_ITEMS,
  MAX_CATEGORY_NAME_LENGTH,
  validateAuditInput,
  validateEncryptedItemPayload,
  verifyPinConstantTime,
} from '../security/crypto';

interface VaultRow extends RowDataPacket {
  id: string;
  title: string;
  username: string | null;
  email: string | null;
  encrypted_password: string | null;
  encrypted_notes: string | null;
  urls_json: string | null;
  category_id: string | null;
  is_favorite: number;
  encrypted_payload: string | null;
  created_at: Date;
  updated_at: Date;
}

interface CategoryRow extends RowDataPacket {
  id: string;
  name: string;
  created_at: Date;
}

interface SettingsRow extends RowDataPacket {
  auto_lock_minutes: number;
  clipboard_clear_seconds: number;
}

interface AuditRow extends RowDataPacket {
  id: string;
  action: string;
  summary: string;
  created_at: Date;
}

interface OwnerRow extends RowDataPacket {
  pin_salt: string;
  pin_verifier: string;
}

function mapVaultRow(row: VaultRow) {
  let urls: string[] = [];
  if (row.urls_json) {
    try {
      const parsed = JSON.parse(row.urls_json);
      if (Array.isArray(parsed)) urls = parsed.map(String);
    } catch {
      urls = [];
    }
  }
  return {
    id: row.id,
    title: row.title,
    username: row.username || undefined,
    email: row.email || undefined,
    encryptedPassword: row.encrypted_password || undefined,
    urls,
    encryptedNotes: row.encrypted_notes || undefined,
    categoryId: row.category_id || undefined,
    isFavorite: Boolean(row.is_favorite),
    encryptedSecretsPayload: row.encrypted_payload || '',
    createdAt: new Date(row.created_at).toISOString(),
    updatedAt: new Date(row.updated_at).toISOString(),
  };
}

function isValidEntityId(id: unknown): id is string {
  return typeof id === 'string' && id.trim().length > 0 && id.length <= 64;
}

export const apiRouter = Router();
const destructiveLimiter = createRateLimiter(10, 5 * 60 * 1000);

apiRouter.use(requireSession);
apiRouter.use(requireCsrf);

apiRouter.get('/vault', async (_req, res) => {
  try {
    const [itemRows] = await pool.execute<VaultRow[]>(
      'SELECT * FROM vault_items ORDER BY updated_at DESC'
    );
    const [catRows] = await pool.execute<CategoryRow[]>(
      'SELECT id, name, created_at FROM categories ORDER BY created_at ASC'
    );
    const [settingsRows] = await pool.execute<SettingsRow[]>(
      'SELECT auto_lock_minutes, clipboard_clear_seconds FROM app_settings WHERE id = 1 LIMIT 1'
    );

    const settings = settingsRows[0]
      ? {
          autoLockMinutes: Number(settingsRows[0].auto_lock_minutes) || 5,
          clipboardClearSeconds: Number(settingsRows[0].clipboard_clear_seconds) || 20,
        }
      : { autoLockMinutes: 5, clipboardClearSeconds: 20 };

    res.json({
      items: itemRows.map(mapVaultRow),
      categories: catRows.map((c) => ({
        id: c.id,
        name: c.name,
        createdAt: new Date(c.created_at).toISOString(),
      })),
      settings,
    });
  } catch {
    res.status(503).json({ error: 'تعذر تحميل البيانات من الخادم' });
  }
});

apiRouter.post('/vault', async (req, res) => {
  const body = req.body as Record<string, unknown>;
  const check = validateEncryptedItemPayload(body);
  if (!check.valid) {
    res.status(400).json({ error: check.error });
    return;
  }

  const id = crypto.randomUUID();
  const now = toSqlDateTime();
  const urlsJson = JSON.stringify(Array.isArray(body.urls) ? body.urls : []);
  const requestedCategoryId =
    typeof body.categoryId === 'string' && body.categoryId.trim() ? body.categoryId.trim() : null;

  try {
    await withTransaction(async (conn) => {
      let resolvedCategoryId: string | null = null;
      if (requestedCategoryId) {
        const [cats] = await conn.execute<CategoryRow[]>(
          'SELECT id FROM categories WHERE id = ? LIMIT 1',
          [requestedCategoryId]
        );
        if (cats[0]) resolvedCategoryId = cats[0].id;
      }

      await conn.execute(
        `INSERT INTO vault_items
          (id, title, username, email, encrypted_password, encrypted_notes, urls_json, category_id, is_favorite, encrypted_payload, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          id,
          String(body.title).trim(),
          typeof body.username === 'string' ? body.username.trim() || null : null,
          typeof body.email === 'string' ? body.email.trim() || null : null,
          typeof body.encryptedPassword === 'string' && body.encryptedPassword
            ? body.encryptedPassword
            : null,
          typeof body.encryptedNotes === 'string' && body.encryptedNotes
            ? body.encryptedNotes
            : null,
          urlsJson,
          resolvedCategoryId,
          Boolean(body.isFavorite),
          String(body.encryptedSecretsPayload || ''),
          now,
          now,
        ]
      );

      await conn.execute(
        `INSERT INTO audit_events (id, action, summary, created_at)
         VALUES (?, 'create', ?, ?)`,
        [crypto.randomUUID(), `إضافة عنصر: ${String(body.title).trim().slice(0, 120)}`, now]
      );
    });

    const [rows] = await pool.execute<VaultRow[]>('SELECT * FROM vault_items WHERE id = ? LIMIT 1', [
      id,
    ]);
    res.status(201).json(mapVaultRow(rows[0]));
  } catch {
    res.status(503).json({ error: 'تعذر الحفظ على الخادم' });
  }
});

apiRouter.put('/vault/:id', async (req, res) => {
  const { id } = req.params;
  if (!isValidEntityId(id)) {
    res.status(400).json({ error: 'معرّف العنصر غير صالح' });
    return;
  }

  const body = req.body as Record<string, unknown>;
  const check = validateEncryptedItemPayload(body);
  if (!check.valid) {
    res.status(400).json({ error: check.error });
    return;
  }

  const now = toSqlDateTime();
  const urlsJson = JSON.stringify(Array.isArray(body.urls) ? body.urls : []);
  const requestedCategoryId =
    typeof body.categoryId === 'string' && body.categoryId.trim() ? body.categoryId.trim() : null;

  try {
    const updatedRow = await withTransaction(async (conn) => {
      const [existing] = await conn.execute<VaultRow[]>(
        'SELECT id FROM vault_items WHERE id = ? LIMIT 1',
        [id]
      );
      if (existing.length === 0) {
        return null;
      }

      let resolvedCategoryId: string | null = null;
      if (requestedCategoryId) {
        const [cats] = await conn.execute<CategoryRow[]>(
          'SELECT id FROM categories WHERE id = ? LIMIT 1',
          [requestedCategoryId]
        );
        if (cats[0]) resolvedCategoryId = cats[0].id;
      }

      await conn.execute(
        `UPDATE vault_items
         SET title = ?, username = ?, email = ?, encrypted_password = ?, encrypted_notes = ?,
             urls_json = ?, category_id = ?, is_favorite = ?, encrypted_payload = ?, updated_at = ?
         WHERE id = ?`,
        [
          String(body.title).trim(),
          typeof body.username === 'string' ? body.username.trim() || null : null,
          typeof body.email === 'string' ? body.email.trim() || null : null,
          typeof body.encryptedPassword === 'string' && body.encryptedPassword
            ? body.encryptedPassword
            : null,
          typeof body.encryptedNotes === 'string' && body.encryptedNotes
            ? body.encryptedNotes
            : null,
          urlsJson,
          resolvedCategoryId,
          Boolean(body.isFavorite),
          String(body.encryptedSecretsPayload || ''),
          now,
          id,
        ]
      );

      await conn.execute(
        `INSERT INTO audit_events (id, action, summary, created_at)
         VALUES (?, 'update', ?, ?)`,
        [crypto.randomUUID(), `تحديث عنصر: ${String(body.title).trim().slice(0, 120)}`, now]
      );

      const [rows] = await conn.execute<VaultRow[]>(
        'SELECT * FROM vault_items WHERE id = ? LIMIT 1',
        [id]
      );
      return rows[0];
    });

    if (!updatedRow) {
      res.status(404).json({ error: 'العنصر غير موجود' });
      return;
    }
    res.json(mapVaultRow(updatedRow));
  } catch {
    res.status(503).json({ error: 'تعذر الحفظ على الخادم' });
  }
});

apiRouter.delete('/vault/:id', async (req, res) => {
  const { id } = req.params;
  if (!isValidEntityId(id)) {
    res.status(400).json({ error: 'معرّف العنصر غير صالح' });
    return;
  }
  const now = toSqlDateTime();
  try {
    await withTransaction(async (conn) => {
      const [rows] = await conn.execute<VaultRow[]>(
        'SELECT title FROM vault_items WHERE id = ? LIMIT 1',
        [id]
      );
      await conn.execute('DELETE FROM vault_items WHERE id = ?', [id]);
      await conn.execute(
        `INSERT INTO audit_events (id, action, summary, created_at)
         VALUES (?, 'delete', ?, ?)`,
        [crypto.randomUUID(), `حذف عنصر: ${(rows[0]?.title || id).slice(0, 120)}`, now]
      );
    });
    res.json({ ok: true });
  } catch {
    res.status(503).json({ error: 'تعذر الحفظ على الخادم' });
  }
});

async function handleBatchImport(
  req: AuthenticatedRequest,
  res: import('express').Response,
  expectedSource: 'excel' | 'aman_restore'
) {
  const { items, categories, replaceExisting } = req.body as {
    items?: Array<Record<string, unknown>>;
    categories?: Array<{ id?: string; name?: string }>;
    replaceExisting?: boolean;
  };

  if (!Array.isArray(items) || !Array.isArray(categories)) {
    res.status(400).json({ error: 'بيانات الاستيراد غير صالحة' });
    return;
  }

  if (items.length > MAX_BATCH_ITEMS || categories.length > MAX_BATCH_CATEGORIES) {
    res.status(400).json({ error: 'عدد العناصر أو التصنيفات يتجاوز الحد المسموح للاستيراد' });
    return;
  }

  for (const cat of categories) {
    if (
      !cat ||
      typeof cat !== 'object' ||
      (cat.name !== undefined &&
        (typeof cat.name !== 'string' || cat.name.trim().length > MAX_CATEGORY_NAME_LENGTH))
    ) {
      res.status(400).json({ error: 'بيانات التصنيفات غير صالحة' });
      return;
    }
  }

  for (const item of items) {
    const check = validateEncryptedItemPayload(item);
    if (!check.valid) {
      res.status(400).json({ error: check.error });
      return;
    }
  }

  const now = toSqlDateTime();

  try {
    const result = await withTransaction(async (conn) => {
      if (replaceExisting) {
        await conn.execute('DELETE FROM vault_items');
        await conn.execute('DELETE FROM categories');
      }

      const validCategoryIds = new Set<string>();
      if (!replaceExisting) {
        const [existingCats] = await conn.execute<CategoryRow[]>('SELECT id FROM categories');
        for (const row of existingCats) {
          validCategoryIds.add(row.id);
        }
      }

      for (const cat of categories) {
        const catId =
          isValidEntityId(cat.id) ? cat.id.trim() : crypto.randomUUID();
        const catName = typeof cat.name === 'string' ? cat.name.trim() : 'عام';
        if (!catName) continue;
        await conn.execute(
          `INSERT INTO categories (id, name, created_at)
           VALUES (?, ?, ?)
           ON DUPLICATE KEY UPDATE name = VALUES(name)`,
          [catId, catName.slice(0, MAX_CATEGORY_NAME_LENGTH), now]
        );
        validCategoryIds.add(catId);
      }

      for (const body of items) {
        const id = crypto.randomUUID();
        const urlsJson = JSON.stringify(Array.isArray(body.urls) ? body.urls : []);
        const rawCategoryId =
          typeof body.categoryId === 'string' && body.categoryId.trim()
            ? body.categoryId.trim()
            : null;
        const resolvedCategoryId =
          rawCategoryId && validCategoryIds.has(rawCategoryId) ? rawCategoryId : null;

        await conn.execute(
          `INSERT INTO vault_items
            (id, title, username, email, encrypted_password, encrypted_notes, urls_json, category_id, is_favorite, encrypted_payload, created_at, updated_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          [
            id,
            String(body.title).trim(),
            typeof body.username === 'string' ? body.username.trim() || null : null,
            typeof body.email === 'string' ? body.email.trim() || null : null,
            typeof body.encryptedPassword === 'string' && body.encryptedPassword
              ? body.encryptedPassword
              : null,
            typeof body.encryptedNotes === 'string' && body.encryptedNotes
              ? body.encryptedNotes
              : null,
            urlsJson,
            resolvedCategoryId,
            Boolean(body.isFavorite),
            String(body.encryptedSecretsPayload || ''),
            now,
            now,
          ]
        );
      }

      const auditAction = expectedSource === 'aman_restore' ? 'restore' : 'excel_import';
      const auditSummary =
        expectedSource === 'aman_restore'
          ? `استعادة نسخة مشفرة (${items.length} عنصر)`
          : `استيراد من Excel (${items.length} عنصر)`;

      await conn.execute(
        `INSERT INTO audit_events (id, action, summary, created_at)
         VALUES (?, ?, ?, ?)`,
        [crypto.randomUUID(), auditAction, auditSummary, now]
      );

      const [allCats] = await conn.execute<CategoryRow[]>(
        'SELECT id, name, created_at FROM categories ORDER BY created_at ASC'
      );
      const [allItems] = await conn.execute<VaultRow[]>(
        'SELECT * FROM vault_items ORDER BY updated_at DESC'
      );

      return {
        importedCount: items.length,
        categories: allCats.map((c) => ({
          id: c.id,
          name: c.name,
          createdAt: new Date(c.created_at).toISOString(),
        })),
        items: allItems.map(mapVaultRow),
      };
    });

    res.json(result);
  } catch {
    res.status(503).json({ error: 'تعذر الحفظ على الخادم — تم التراجع عن العملية' });
  }
}

apiRouter.post('/vault/import', (req: AuthenticatedRequest, res) =>
  handleBatchImport(req, res, 'excel')
);

apiRouter.post('/restore', destructiveLimiter, (req: AuthenticatedRequest, res) =>
  handleBatchImport(req, res, 'aman_restore')
);

apiRouter.get('/categories', async (_req, res) => {
  try {
    const [rows] = await pool.execute<CategoryRow[]>(
      'SELECT id, name, created_at FROM categories ORDER BY created_at ASC'
    );
    res.json(
      rows.map((c) => ({
        id: c.id,
        name: c.name,
        createdAt: new Date(c.created_at).toISOString(),
      }))
    );
  } catch {
    res.status(503).json({ error: 'تعذر تحميل التصنيفات' });
  }
});

apiRouter.post('/categories', async (req, res) => {
  const { id, name } = req.body as { id?: string; name?: string };
  if (
    typeof name !== 'string' ||
    !name.trim() ||
    name.trim().length > MAX_CATEGORY_NAME_LENGTH
  ) {
    res.status(400).json({ error: 'اسم التصنيف مطلوب ويجب أن يكون ضمن الطول المسموح' });
    return;
  }
  const catId = isValidEntityId(id) ? id.trim() : crypto.randomUUID();
  const cleanName = name.trim();
  const now = toSqlDateTime();
  try {
    await pool.execute(
      `INSERT INTO categories (id, name, created_at)
       VALUES (?, ?, ?)
       ON DUPLICATE KEY UPDATE name = VALUES(name)`,
      [catId, cleanName, now]
    );
    res.status(201).json({
      id: catId,
      name: cleanName,
      createdAt: new Date().toISOString(),
    });
  } catch {
    res.status(503).json({ error: 'تعذر الحفظ على الخادم' });
  }
});

apiRouter.delete('/categories/:id', async (req, res) => {
  const { id } = req.params;
  if (!isValidEntityId(id)) {
    res.status(400).json({ error: 'معرّف التصنيف غير صالح' });
    return;
  }
  try {
    await withTransaction(async (conn) => {
      await conn.execute('UPDATE vault_items SET category_id = NULL WHERE category_id = ?', [id]);
      await conn.execute('DELETE FROM categories WHERE id = ?', [id]);
    });
    res.json({ ok: true });
  } catch {
    res.status(503).json({ error: 'تعذر الحفظ على الخادم' });
  }
});

apiRouter.get('/audit', async (_req, res) => {
  try {
    const [rows] = await pool.execute<AuditRow[]>(
      'SELECT id, action, summary, created_at FROM audit_events ORDER BY created_at DESC LIMIT 200'
    );
    res.json(
      rows.map((r) => ({
        id: r.id,
        action: r.action,
        summary: r.summary,
        createdAt: new Date(r.created_at).toISOString(),
      }))
    );
  } catch {
    res.status(503).json({ error: 'تعذر تحميل سجل التدقيق' });
  }
});

apiRouter.post('/audit', async (req, res) => {
  const { action, summary } = req.body as { action?: unknown; summary?: unknown };
  const checked = validateAuditInput(action, summary);
  if (!checked.valid || !checked.action || !checked.summary) {
    res.status(400).json({ error: 'بيانات سجل التدقيق غير صالحة' });
    return;
  }
  try {
    await pool.execute(
      'INSERT INTO audit_events (id, action, summary, created_at) VALUES (?, ?, ?, ?)',
      [crypto.randomUUID(), checked.action, checked.summary, toSqlDateTime()]
    );
    res.status(201).json({ ok: true });
  } catch {
    res.status(503).json({ error: 'تعذر الحفظ على الخادم' });
  }
});

apiRouter.put('/settings', async (req, res) => {
  const { autoLockMinutes, clipboardClearSeconds } = req.body as {
    autoLockMinutes?: number;
    clipboardClearSeconds?: number;
  };
  const lockMin = Math.max(1, Math.min(120, Number(autoLockMinutes) || 5));
  const clipSec = Math.max(5, Math.min(300, Number(clipboardClearSeconds) || 20));

  try {
    await pool.execute(
      `INSERT INTO app_settings (id, auto_lock_minutes, clipboard_clear_seconds, updated_at)
       VALUES (1, ?, ?, ?)
       ON DUPLICATE KEY UPDATE
         auto_lock_minutes = VALUES(auto_lock_minutes),
         clipboard_clear_seconds = VALUES(clipboard_clear_seconds),
         updated_at = VALUES(updated_at)`,
      [lockMin, clipSec, toSqlDateTime()]
    );
    res.json({ autoLockMinutes: lockMin, clipboardClearSeconds: clipSec });
  } catch {
    res.status(503).json({ error: 'تعذر الحفظ على الخادم' });
  }
});

apiRouter.post('/wipe', destructiveLimiter, async (req, res) => {
  const { pin } = req.body as { pin?: string };
  if (typeof pin !== 'string' || !/^\d{6}$/.test(pin)) {
    res.status(400).json({ error: 'رمز الأمان غير صحيح' });
    return;
  }

  try {
    const [owners] = await pool.execute<OwnerRow[]>(
      'SELECT pin_salt, pin_verifier FROM owner_security WHERE id = 1 LIMIT 1'
    );
    const owner = owners[0];
    if (!owner || !verifyPinConstantTime(pin, owner.pin_salt, owner.pin_verifier)) {
      res.status(401).json({ error: 'رمز أمان غير صحيح' });
      return;
    }

    await withTransaction(async (conn) => {
      await conn.execute('DELETE FROM vault_items');
      await conn.execute('DELETE FROM categories');
      await conn.execute('DELETE FROM audit_events');
      await conn.execute('DELETE FROM app_settings');
      await conn.execute('DELETE FROM biometric_credentials');
      await conn.execute('DELETE FROM webauthn_challenges');
      await conn.execute('DELETE FROM sessions');
      await conn.execute('DELETE FROM owner_security');
    });

    res.clearCookie(SESSION_COOKIE_NAME, { path: '/' });
    res.json({ ok: true });
  } catch {
    res.status(503).json({ error: 'تعذر تنفيذ المسح على الخادم' });
  }
});
