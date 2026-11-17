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
          <div className="w-full max-w-md rounded-2xl border border-red-500/30 bg-[#111717] p-7 text-center shadow-2xl">
            <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-xl bg-red-500/15 text-red-400">
              <ShieldAlert className="h-6 w-6" />
            </div>
            <h1 className="mb-2 text-xl font-bold text-[#f3f6f5]">
              تعذر عرض واجهة الخزنة
            </h1>
            <p className="mb-6 text-sm text-[#93a19f]">{this.state.message}</p>
            <button
              type="button"
              onClick={() => window.location.reload()}
              className="inline-flex items-center justify-center gap-2 rounded-xl bg-[#e5b440] px-5 py-2.5 text-sm font-bold text-[#0b0e0e] transition hover:bg-[#ffd365]"
            >
              <RotateCcw className="h-4 w-4" />
              إعادة تحميل أمان
            </button>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}
