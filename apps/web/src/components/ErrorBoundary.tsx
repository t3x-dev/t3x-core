'use client';

import { AlertTriangle, RefreshCw } from 'lucide-react';
import { Component, type ReactNode } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';

interface ErrorBoundaryProps {
  children: ReactNode;
  fallback?: ReactNode; // 自定义错误展示（可选）
}

interface ErrorBoundaryState {
  hasError: boolean;
  error: Error | null;
}

/**
 * Error Boundary 组件
 *
 * 捕获子组件渲染时的 JavaScript 错误，防止整个页面白屏。
 * 显示友好的错误提示和重试按钮。
 *
 * 使用方式:
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
      // 如果提供了自定义 fallback，使用它
      if (this.props.fallback) {
        return this.props.fallback;
      }

      // 默认错误 UI
      return (
        <div className="flex h-full min-h-[200px] items-center justify-center p-6">
          <Card className="max-w-md border-[var(--status-error)]/30 bg-[var(--status-error)]/5">
            <CardContent className="flex flex-col items-center py-8 text-center">
              <AlertTriangle className="mb-[var(--space-group)] h-12 w-12 text-[var(--status-error)]" />
              <h2 className="text-lg font-semibold text-[var(--status-error)]">
                Something went wrong
              </h2>
              <p className="mt-2 text-sm text-muted-foreground">
                An error occurred while rendering this component.
              </p>

              {/* 开发模式下显示错误详情 */}
              {process.env.NODE_ENV === 'development' && this.state.error && (
                <div className="mt-4 w-full rounded bg-muted/50 p-3 text-left">
                  <p className="text-xs font-medium text-[var(--status-error)]">Error Details:</p>
                  <pre className="mt-1 overflow-auto text-xs text-muted-foreground">
                    {this.state.error.message}
                  </pre>
                </div>
              )}

              <Button variant="outline" size="sm" className="mt-6" onClick={this.handleRetry}>
                <RefreshCw className="h-4 w-4" />
                Try Again
              </Button>
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

export default ErrorBoundary;
