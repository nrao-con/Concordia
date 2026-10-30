import { Component, ErrorInfo, ReactNode } from "react";
import { Button } from "@/components/ui/button";
import { AlertTriangle, RefreshCw, Home } from "lucide-react";

interface Props {
  children: ReactNode;
  fallback?: ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
}

export class ErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error("[ErrorBoundary] Caught unhandled error:", error.message);
    console.error("[ErrorBoundary] Component stack:", info.componentStack);

    if (
      import.meta.env.DEV &&
      /Cannot read properties of null \(reading 'use(State|Effect|Memo|Callback|Ref)'\)/.test(error.message)
    ) {
      const recoveryKey = "react-runtime-recovery-at";
      const lastRecovery = Number(sessionStorage.getItem(recoveryKey) || 0);
      if (Date.now() - lastRecovery > 10_000) {
        sessionStorage.setItem(recoveryKey, String(Date.now()));
        window.location.reload();
      }
    }
  }

  handleReset = () => {
    window.location.reload();
  };

  handleGoHome = () => {
    this.setState({ hasError: false, error: null });
    window.location.href = "/";
  };

  render() {
    if (this.state.hasError) {
      if (this.props.fallback) {
        return this.props.fallback;
      }

      return (
        <div className="min-h-screen flex items-center justify-center bg-[hsl(222 47% 8%)] px-4">
          <div className="max-w-md w-full text-center space-y-8">

            <div className="flex justify-center">
              <div className="h-20 w-20 rounded-full bg-red-500/10 border border-red-500/20 flex items-center justify-center">
                <AlertTriangle className="h-9 w-9 text-red-400" />
              </div>
            </div>

            <div className="space-y-3">
              <h1 className="text-2xl font-bold text-white">Something went wrong</h1>
              <p className="text-slate-400 text-sm leading-relaxed max-w-sm mx-auto">
                An unexpected error occurred on this page. Your session and any
                saved data are safe. Try refreshing, or go back to the home page.
              </p>
            </div>

            {import.meta.env.DEV && this.state.error && (
              <div className="rounded-md bg-slate-800/60 border border-slate-700/50 p-4 text-left">
                <p className="text-xs font-mono text-slate-400 mb-1">Error details (dev only):</p>
                <p className="text-xs font-mono text-red-300 break-all leading-relaxed">
                  {this.state.error.message}
                </p>
              </div>
            )}

            <div className="flex items-center justify-center gap-3">
              <Button
                onClick={this.handleReset}
                variant="outline"
                className="gap-2"
                data-testid="button-error-retry"
              >
                <RefreshCw className="h-4 w-4" />
                Try again
              </Button>
              <Button
                onClick={this.handleGoHome}
                className="gap-2"
                data-testid="button-error-home"
              >
                <Home className="h-4 w-4" />
                Go home
              </Button>
            </div>

            <p className="text-xs text-slate-600">
              If this keeps happening, contact us at{" "}
              <a
                href="tel:+17183282833"
                className="text-slate-500 hover:text-slate-400 transition-colors"
              >
                (718) 328-2833
              </a>
            </p>

          </div>
        </div>
      );
    }

    return this.props.children;
  }
}
