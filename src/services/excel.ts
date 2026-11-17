import * as XLSX from 'xlsx';
import type { Category, SecretEntry, VaultItem, VaultItemInput } from '../types/aman';
import { normalizeArabic, normalizeUrl, safeString } from '../utils/normalize';

const EXCEL_COLUMNS = [
  'العنوان',
  'التصنيف',
  'اسم المستخدم',
  'البريد الإلكتروني',
  'كلمة المرور',
  'الروابط',
  'مفاتيح API',
  'الرموز (Tokens)',
  'المفاتيح السرية',
  'مفاتيح الترخيص',
  'الشهادات',
  'الملاحظات',
  'مفضل',
] as const;

function serializeSecrets(entries: SecretEntry[]): string {
  if (!entries.length) return '';
  return entries.map((e) => `${e.label}: ${e.value}`).join(' | ');
}

function parseSecretsCell(raw: string): SecretEntry[] {
  const clean = raw.trim();
  if (!clean) return [];
  return clean
    .split('|')
    .map((part) => part.trim())
    .filter(Boolean)
    .map((part, idx) => {
      const colonIdx = part.indexOf(':');
      if (colonIdx > 0) {
        return {
          id: crypto.randomUUID(),
          label: part.slice(0, colonIdx).trim() || `مفتاح ${idx + 1}`,
          value: part.slice(colonIdx + 1).trim(),
        };
      }
      return {
        id: crypto.randomUUID(),
        label: `قيمة ${idx + 1}`,
        value: part,
      };
    });
}

export function exportVaultToXlsx(items: VaultItem[], categories: Category[]): void {
  const categoryMap = new Map(categories.map((c) => [c.id, c.name]));

  const rows = items.map((item) => ({
    العنوان: item.title,
    التصنيف: item.categoryId ? categoryMap.get(item.categoryId) || '' : '',
    'اسم المستخدم': item.username || '',
    'البريد الإلكتروني': item.email || '',
    'كلمة المرور': item.password || '',
    الروابط: item.urls.join(' , '),
    'مفاتيح API': serializeSecrets(item.apiKeys),
    'الرموز (Tokens)': serializeSecrets(item.tokens),
    'المفاتيح السرية': serializeSecrets(item.secretKeys),
    'مفاتيح الترخيص': serializeSecrets(item.licenseKeys),
    الشهادات: serializeSecrets(item.certificates),
    الملاحظات: item.notes || '',
    مفضل: item.isFavorite ? 'نعم' : 'لا',
  }));

  const worksheet = XLSX.utils.json_to_sheet(rows, {
    header: [...EXCEL_COLUMNS],
  });
  worksheet['!cols'] = [
    { wch: 26 },
    { wch: 20 },
    { wch: 18 },
    { wch: 24 },
    { wch: 22 },
    { wch: 30 },
    { wch: 28 },
    { wch: 28 },
    { wch: 28 },
    { wch: 24 },
    { wch: 26 },
    { wch: 30 },
    { wch: 10 },
  ];

  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, worksheet, 'AMAN_Vault');

  const dateTag = new Date().toISOString().slice(0, 10);
  XLSX.writeFile(workbook, `aman-vault-${dateTag}.xlsx`);
}

export interface ExcelPreviewRow {
  rowNumber: number;
  status: 'valid' | 'duplicate' | 'invalid';
  reason?: string;
  categoryName?: string;
  hasPassword: boolean;
  secretsCount: number;
  itemInput?: VaultItemInput;
  title: string;
  username?: string;
  email?: string;
  urlsCount: number;
}

export interface ExcelImportPreview {
  fileName: string;
  totalRows: number;
  validCount: number;
  duplicateCount: number;
  invalidCount: number;
  missingColumns: string[];
  rows: ExcelPreviewRow[];
  newCategories: string[];
}

export async function parseAndValidateXlsx(
  file: File,
  existingItems: VaultItem[],
  existingCategories: Category[]
): Promise<ExcelImportPreview> {
  if (!file.name.toLowerCase().endsWith('.xlsx')) {
    throw new Error('يرجى اختيار ملف Excel حقيقي بصيغة .xlsx فقط');
  }

  const buffer = await file.arrayBuffer();
  const workbook = XLSX.read(buffer, { type: 'array' });
  const firstSheetName = workbook.SheetNames[0];
  if (!firstSheetName) {
    throw new Error('ملف Excel فارغ ولا يحتوي على أوراق عمل');
  }

  const sheet = workbook.Sheets[firstSheetName];
  const rawMatrix = XLSX.utils.sheet_to_json<unknown[]>(sheet, { header: 1, defval: '' });
  if (rawMatrix.length < 2) {
    throw new Error('ورقة العمل لا تحتوي على صفوف بيانات صالحة');
  }

  const headers = (rawMatrix[0] || []).map((h) => safeString(h).trim());
  const requiredColumns = ['العنوان'];
  const missingColumns = requiredColumns.filter((col) => !headers.includes(col));

  const rawObjects = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, { defval: '' });
  const existingTitles = new Set(existingItems.map((i) => normalizeArabic(i.title)));
  const existingCategoryByNorm = new Map(
    existingCategories.map((c) => [normalizeArabic(c.name), c])
  );
  const discoveredNewCats = new Map<string, string>();
  const seenInFile = new Set<string>();

  const rows: ExcelPreviewRow[] = rawObjects.map((rowObj, idx) => {
    const rowNumber = idx + 2;
    const title = safeString(rowObj['العنوان'] ?? rowObj['title'] ?? rowObj['Title']).trim();
    const categoryName = safeString(
      rowObj['التصنيف'] ?? rowObj['category'] ?? rowObj['Category']
    ).trim();
    const username = safeString(
      rowObj['اسم المستخدم'] ?? rowObj['username'] ?? rowObj['Username']
    ).trim();
    const email = safeString(
      rowObj['البريد الإلكتروني'] ?? rowObj['email'] ?? rowObj['Email']
    ).trim();
    const password = safeString(
      rowObj['كلمة المرور'] ?? rowObj['password'] ?? rowObj['Password']
    );
    const urlsRaw = safeString(rowObj['الروابط'] ?? rowObj['urls'] ?? rowObj['URL']);
    const notes = safeString(rowObj['الملاحظات'] ?? rowObj['notes'] ?? rowObj['Notes']);
    const favRaw = safeString(rowObj['مفضل'] ?? rowObj['favorite']).trim().toLowerCase();

    if (!title) {
      return {
        rowNumber,
        status: 'invalid',
        reason: 'حقل العنوان مطلوب ومفقود',
        hasPassword: Boolean(password),
        secretsCount: 0,
        title: `صف #${rowNumber}`,
        urlsCount: 0,
      };
    }

    const rawUrlTokens = urlsRaw
      .split(/[\n,]+/)
      .map((u) => u.trim())
      .filter(Boolean);
    const validUrls: string[] = [];
    for (const token of rawUrlTokens) {
      const normalized = normalizeUrl(token);
      if (!normalized) {
        return {
          rowNumber,
          status: 'invalid',
          reason: `رابط غير آمن أو غير صالح: ${token}`,
          hasPassword: Boolean(password),
          secretsCount: 0,
          title,
          username: username || undefined,
          email: email || undefined,
          urlsCount: 0,
        };
      }
      validUrls.push(normalized);
    }

    if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return {
        rowNumber,
        status: 'invalid',
        reason: 'صيغة البريد الإلكتروني غير صالحة',
        hasPassword: Boolean(password),
        secretsCount: 0,
        title,
        username: username || undefined,
        email,
        urlsCount: validUrls.length,
      };
    }

    const normTitle = normalizeArabic(title);
    const isDuplicate = existingTitles.has(normTitle) || seenInFile.has(normTitle);
    seenInFile.add(normTitle);

    const apiKeys = parseSecretsCell(safeString(rowObj['مفاتيح API']));
    const tokens = parseSecretsCell(safeString(rowObj['الرموز (Tokens)']));
    const secretKeys = parseSecretsCell(safeString(rowObj['المفاتيح السرية']));
    const licenseKeys = parseSecretsCell(safeString(rowObj['مفاتيح الترخيص']));
    const certificates = parseSecretsCell(safeString(rowObj['الشهادات']));
    const secretsCount =
      apiKeys.length +
      tokens.length +
      secretKeys.length +
      licenseKeys.length +
      certificates.length;

    let resolvedCategoryId: string | undefined;
    if (categoryName) {
      const catNorm = normalizeArabic(categoryName);
      const existingCat = existingCategoryByNorm.get(catNorm);
      if (existingCat) {
        resolvedCategoryId = existingCat.id;
      } else if (!discoveredNewCats.has(catNorm)) {
        discoveredNewCats.set(catNorm, categoryName);
      }
    }

    const isFavorite = ['نعم', 'yes', 'true', '1'].includes(favRaw);

    const itemInput: VaultItemInput = {
      title,
      username: username || undefined,
      email: email || undefined,
      password: password || undefined,
      urls: validUrls,
      notes: notes || undefined,
      categoryId: resolvedCategoryId,
      isFavorite,
      apiKeys,
      tokens,
      secretKeys,
      licenseKeys,
      certificates,
    };

    return {
      rowNumber,
      status: isDuplicate ? 'duplicate' : 'valid',
      reason: isDuplicate ? 'عنصر مكرر (العنوان موجود مسبقاً)' : undefined,
      categoryName: categoryName || undefined,
      hasPassword: Boolean(password),
      secretsCount,
      itemInput,
      title,
      username: username || undefined,
      email: email || undefined,
      urlsCount: validUrls.length,
    };
  });

  return {
    fileName: file.name,
    totalRows: rows.length,
    validCount: rows.filter((r) => r.status === 'valid').length,
    duplicateCount: rows.filter((r) => r.status === 'duplicate').length,
    invalidCount: rows.filter((r) => r.status === 'invalid').length,
    missingColumns,
    rows,
    newCategories: Array.from(discoveredNewCats.values()),
  };
}
