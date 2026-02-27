'use client';

import React, { Component, ReactNode } from 'react';
import { Card } from '@/components/ui/Card';

interface Props {
  children: ReactNode;
  title?: string;
}

interface State {
  hasError: boolean;
  error: Error | null;
}

export class ChartErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: React.ErrorInfo) {
    console.error('[charts] Chart render error', {
      module: 'charts',
      error_detail: error.message,
      component_stack: errorInfo.componentStack,
    });
  }

  render() {
    if (this.state.hasError) {
      return (
        <Card title={this.props.title || 'Chart Error'}>
          <div className="flex flex-col items-center justify-center py-8 text-center">
            <p className="text-sm text-red-600 mb-2">Failed to render chart</p>
            <p className="text-xs text-gray-500">{this.state.error?.message}</p>
            <button
              className="mt-3 text-sm text-blue-600 hover:underline"
              onClick={() => this.setState({ hasError: false, error: null })}
            >
              Try again
            </button>
          </div>
        </Card>
      );
    }

    return this.props.children;
  }
}
