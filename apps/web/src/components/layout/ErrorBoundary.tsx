'use client';

import { AlertTriangle, RefreshCw } from 'lucide-react';
import { Component, type ReactNode } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';

interface ErrorBoundaryProps {
  children: ReactNode;
  fallback?: ReactNode; // Custom error display (optional)
}

interface ErrorBoundaryState {
  hasError: boolean;
  error: Error | null;
}

/**
 * Error Boundary component
 *
 * Catches JavaScript errors during child component rendering, preventing full-page crashes.
 * Displays a friendly error message with a retry button.
 *
 * Usage:
 * <ErrorBoundary>
 *   <YourComponent />
 * </ErrorBoundary>
 */
export class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  constructor(props: ErrorBoundaryProps) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: React.ErrorInfo): void {
    // Hydration errors (e.g. browser extensions modifying DOM) — auto-recover
    if (isHydrationError(error)) {
      this.setState({ hasError: false, error: null });
      return;
    }

    if (process.env.NODE_ENV !== 'production') {
      console.error('[ErrorBoundary] Caught error:', error);
      console.error('[ErrorBoundary] Component stack:', errorInfo.componentStack);
    }
  }

  handleRetry = (): void => {
    this.setState({ hasError: false, error: null });
  };

  render(): ReactNode {
    if (this.state.hasError) {
      // If a custom fallback was provided, use it
      if (this.props.fallback) {
        return this.props.fallback;
      }

      // Default error UI
      return (
        <div className="flex h-full min-h-[200px] items-center justify-center p-6">
          <Card className="max-w-md border-[var(--status-error)]/30 bg-[var(--status-error)]/5">
            <CardContent className="flex flex-col items-center py-8 text-center">
              <AlertTriangle className="mb-[var(--space-group)] h-12 w-12 text-[var(--status-error)]" />
              <h2 className="text-lg font-semibold text-[var(--status-error)]">
                Something went wrong
              </h2>
              <p className="mt-2 text-sm text-muted-foreground">
                {getRecoverySuggestion(this.state.error)}
              </p>

              {/* Show error details in development */}
              {process.env.NODE_ENV === 'development' && this.state.error && (
                <div className="mt-4 w-full rounded bg-muted/50 p-3 text-left">
                  <p className="text-xs font-medium text-[var(--status-error)]">Error Details:</p>
                  <pre className="mt-1 overflow-auto text-xs text-muted-foreground">
                    {this.state.error.message}
                  </pre>
                </div>
              )}

              <div className="mt-6 flex gap-2">
                <Button variant="outline" size="sm" onClick={this.handleRetry}>
                  <RefreshCw className="h-4 w-4" />
                  Try Again
                </Button>
                <Button variant="ghost" size="sm" onClick={() => window.location.reload()}>
                  Reload Page
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>
      );
    }

    return this.props.children;
  }
}

function isHydrationError(error: Error): boolean {
  const msg = error.message || '';
  return (
    msg.includes('removeChild') ||
    msg.includes('insertBefore') ||
    msg.includes('Hydration failed') ||
    msg.includes('hydrating') ||
    msg.includes('server-rendered HTML')
  );
}

function getRecoverySuggestion(error: Error | null): string {
  if (!error) return 'An unexpected error occurred. Try refreshing the page.';
  const msg = error.message || '';

  if (msg.includes('fetch') || msg.includes('network') || msg.includes('Failed to fetch')) {
    return 'A network error occurred. Check your connection and try again.';
  }
  if (msg.includes('chunk') || msg.includes('Loading chunk')) {
    return 'A code loading error occurred. This usually resolves with a page reload.';
  }
  if (msg.includes('localStorage') || msg.includes('quota')) {
    return 'Browser storage is full. Try clearing site data in your browser settings.';
  }
  return 'An error occurred while rendering this component. Try again or reload the page.';
}

export default ErrorBoundary;
