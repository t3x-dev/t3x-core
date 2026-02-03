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
    // 更新 state，下次渲染时显示错误 UI
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: React.ErrorInfo): void {
    if (process.env.NODE_ENV !== 'production') {
      console.error('[ErrorBoundary] Caught error:', error);
      console.error('[ErrorBoundary] Component stack:', errorInfo.componentStack);
    }
  }

  handleRetry = (): void => {
    // 重置错误状态，尝试重新渲染
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
          <Card className="max-w-md border-red-500/30 bg-red-500/5">
            <CardContent className="flex flex-col items-center py-8 text-center">
              <AlertTriangle className="mb-4 h-12 w-12 text-red-500" />
              <h2 className="text-lg font-semibold text-red-600">Something went wrong</h2>
              <p className="mt-2 text-sm text-muted-foreground">
                An error occurred while rendering this component.
              </p>

              {/* 开发模式下显示错误详情 */}
              {process.env.NODE_ENV === 'development' && this.state.error && (
                <div className="mt-4 w-full rounded bg-muted/50 p-3 text-left">
                  <p className="text-xs font-medium text-red-600">Error Details:</p>
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

export default ErrorBoundary;
