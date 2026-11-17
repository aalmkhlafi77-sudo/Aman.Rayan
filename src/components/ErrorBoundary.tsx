import React from 'react';
import { ShieldAlert, RotateCcw } from 'lucide-react';

interface ErrorBoundaryState {
  hasError: boolean;
  message: string;
}

export class ErrorBoundary extends React.Component<
  { children: React.ReactNode },
  ErrorBoundaryState
> {
  constructor(props: { children: React.ReactNode }) {
    super(props);
    this.state = { hasError: false, message: '' };
  }

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return {
      hasError: true,
      message: error?.message || 'حدث خطأ غير متوقع في واجهة أمان',
    };
  }

  componentDidCatch(): void {
    // Intentionally avoid logging sensitive vault state
  }

  render() {
    if (this.state.hasError) {
      return (
        <div
          dir="rtl"
          className="aman-safe-bg flex min-h-screen items-center justify-center p-6"
        >
          <div className="steel-modal-shell w-full max-w-md rounded-2xl p-1.5 shadow-2xl">
            <div className="steel-modal-body rounded-xl p-7 text-center">
              <div className="steel-recess mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-xl border-[#d95c5c]/50 text-[#d95c5c]">
                <ShieldAlert className="h-6 w-6" />
              </div>
              <h1 className="mb-2 text-xl font-bold text-[#f2f5f5]">
                تعذر عرض واجهة الخزنة
              </h1>
              <p className="mb-6 text-sm text-[#c2cccf]">{this.state.message}</p>
              <button
                type="button"
                onClick={() => window.location.reload()}
                className="steel-btn-primary inline-flex items-center justify-center gap-2 rounded-xl px-5 py-2.5 text-sm font-bold"
              >
                <RotateCcw className="h-4 w-4" />
                إعادة تحميل أمان
              </button>
            </div>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}
