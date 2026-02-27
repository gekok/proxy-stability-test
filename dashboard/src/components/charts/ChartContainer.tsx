'use client';

import { ReactNode } from 'react';
import { ResponsiveContainer } from 'recharts';
import { Card } from '@/components/ui/Card';

interface ChartContainerProps {
  title: string;
  height?: number;
  loading?: boolean;
  empty?: boolean;
  emptyMessage?: string;
  children: ReactNode;
}

export function ChartContainer({
  title,
  height = 300,
  loading,
  empty,
  emptyMessage = 'No data available',
  children,
}: ChartContainerProps) {
  if (loading) {
    return (
      <Card title={title}>
        <div className="flex items-center justify-center" style={{ height }}>
          <div className="animate-pulse text-sm text-gray-400">Loading chart...</div>
        </div>
      </Card>
    );
  }

  if (empty) {
    return (
      <Card title={title}>
        <div className="flex items-center justify-center" style={{ height }}>
          <p className="text-sm text-gray-500">{emptyMessage}</p>
        </div>
      </Card>
    );
  }

  return (
    <Card title={title}>
      <ResponsiveContainer width="100%" height={height}>
        {children as React.ReactElement}
      </ResponsiveContainer>
    </Card>
  );
}
