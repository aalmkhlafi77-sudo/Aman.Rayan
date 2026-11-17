import { createRoot } from 'react-dom/client';
import './index.css';

const rootElement = document.getElementById('root')!;

async function bootstrapApplication() {
  try {
    const [{ default: App }] = await Promise.all([import('./App.tsx')]);
    createRoot(rootElement).render(<App />);
  } catch (err) {
    const message =
      err instanceof Error ? err.message : 'Invalid AMAN runtime configuration';
    console.error('[AMAN Startup Error]', message);
    rootElement.innerHTML = `
      <div dir="rtl" style="min-height:100vh;display:flex;align-items:center;justify-content:center;padding:24px;background:linear-gradient(145deg,#3b474b 0%,#263034 55%,#182023 100%);color:#f2f5f5;font-family:Cairo,system-ui,sans-serif;">
        <div style="max-width:480px;width:100%;border:1px solid rgba(220,235,238,0.35);background:linear-gradient(180deg,#2d373b 0%,#1d2528 100%);border-radius:16px;padding:24px;text-align:center;box-shadow:0 24px 50px rgba(9,13,14,0.55);">
          <h1 style="margin:0 0 8px;font-size:18px;font-weight:800;color:#f4b8b8;">تعذر تشغيل أمان — خطأ في إعدادات البيئة</h1>
          <p style="margin:0 0 12px;font-size:13px;color:#c2cccf;line-height:1.6;">
            إعداد وضع التشغيل (VITE_APP_MODE) غير مضبوط بشكل صحيح لبيئة الإنتاج، ولحماية البيانات لا يمكن التحويل التلقائي لوضع المعاينة.
          </p>
          <pre dir="ltr" style="margin:0;padding:10px;border-radius:10px;background:#13191b;border:1px solid rgba(217,92,92,0.4);color:#94a4a9;font-size:11px;white-space:pre-wrap;text-align:left;">${message.replace(/[<>&]/g, '')}</pre>
        </div>
      </div>
    `;
  }
}

void bootstrapApplication();
