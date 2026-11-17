import React from 'react';
import { CheckCircle2, AlertTriangle, Info, XCircle, X } from 'lucide-react';
import type { ToastMessage } from '../types/aman';

interface ToastContainerProps {
  toasts: ToastMessage[];
  onDismiss: (id: string) => void;
}

export const ToastContainer: React.FC<ToastContainerProps> = ({ toasts, onDismiss }) => {
  if (toasts.length === 0) return null;

  return (
    <div
      dir="rtl"
      aria-live="polite"
      className="pointer-events-none fixed bottom-5 left-5 z-50 flex w-full max-w-sm flex-col gap-2.5 px-4 sm:px-0"
    >
      {toasts.map((toast) => {
        const styleMap = {
          success: {
            accent: 'border-[#36e5a4]/55',
            icon: <CheckCircle2 className="h-5 w-5 shrink-0 text-[#36e5a4]" />,
          },
          error: {
            accent: 'border-[#d95c5c]/65',
            icon: <XCircle className="h-5 w-5 shrink-0 text-[#d95c5c]" />,
          },
          warning: {
            accent: 'border-[#d7aa45]/60',
            icon: <AlertTriangle className="h-5 w-5 shrink-0 text-[#f0c761]" />,
          },
          info: {
            accent: 'border-[#58d9ff]/55',
            icon: <Info className="h-5 w-5 shrink-0 text-[#58d9ff]" />,
          },
        }[toast.type];

        return (
          <div
            key={toast.id}
            className="steel-plate pointer-events-auto rounded-2xl p-[2px] shadow-2xl transition-all"
          >
            <div
              className={`steel-module-dark flex items-start gap-3 rounded-[14px] border ${styleMap.accent} p-3.5`}
            >
              <div className="mt-0.5">{styleMap.icon}</div>
              <div className="min-w-0 flex-1">
                <p className="text-sm font-bold text-[#f2f5f5]">{toast.title}</p>
                {toast.description ? (
                  <p className="mt-0.5 text-xs text-[#c2cccf]">{toast.description}</p>
                ) : null}
              </div>
              <button
                type="button"
                onClick={() => onDismiss(toast.id)}
                aria-label="إغلاق الإشعار"
                className="rounded-lg p-1 text-[#94a4a9] transition hover:bg-white/10 hover:text-[#f2f5f5]"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
          </div>
        );
      })}
    </div>
  );
};
