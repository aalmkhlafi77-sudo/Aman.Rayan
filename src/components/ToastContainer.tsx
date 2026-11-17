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
            border: 'border-emerald-500/35',
            icon: <CheckCircle2 className="h-5 w-5 shrink-0 text-emerald-400" />,
          },
          error: {
            border: 'border-red-500/40',
            icon: <XCircle className="h-5 w-5 shrink-0 text-red-400" />,
          },
          warning: {
            border: 'border-amber-500/40',
            icon: <AlertTriangle className="h-5 w-5 shrink-0 text-amber-400" />,
          },
          info: {
            border: 'border-white/15',
            icon: <Info className="h-5 w-5 shrink-0 text-[#e5b440]" />,
          },
        }[toast.type];

        return (
          <div
            key={toast.id}
            className={`pointer-events-auto flex items-start gap-3 rounded-xl border ${styleMap.border} bg-[#111717]/95 p-3.5 shadow-2xl backdrop-blur-md transition-all`}
          >
            <div className="mt-0.5">{styleMap.icon}</div>
            <div className="min-w-0 flex-1">
              <p className="text-sm font-bold text-[#f3f6f5]">{toast.title}</p>
              {toast.description ? (
                <p className="mt-0.5 text-xs text-[#93a19f]">{toast.description}</p>
              ) : null}
            </div>
            <button
              type="button"
              onClick={() => onDismiss(toast.id)}
              aria-label="إغلاق الإشعار"
              className="rounded-lg p-1 text-[#93a19f] transition hover:bg-white/5 hover:text-white"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        );
      })}
    </div>
  );
};
