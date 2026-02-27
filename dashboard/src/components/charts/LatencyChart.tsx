'use client';

import { LineChart, Line, XAxis, YAxis, CartesianGrid, Legend, Tooltip } from 'recharts';
import { LatencyDataPoint } from '@/types';
import { ChartContainer } from './ChartContainer';
import { ChartTooltip } from './ChartTooltip';
import { CHART_COLORS, formatMs } from './chart-utils';

interface LatencyChartProps {
  data: LatencyDataPoint[];
  loading?: boolean;
}

export function LatencyChart({ data, loading }: LatencyChartProps) {
  const showDots = data.length <= 5;
  return (
    <ChartContainer
      title="Latency Over Time"
      height={300}
      loading={loading}
      empty={data.length === 0}
      emptyMessage="No latency data yet"
    >
      <LineChart data={data} margin={{ top: 5, right: 20, left: 10, bottom: 5 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
        <XAxis dataKey="time" fontSize={12} />
        <YAxis fontSize={12} tickFormatter={(v: number) => formatMs(v)} />
        <Tooltip content={<ChartTooltip />} />
        <Legend />
        <Line
          type="monotone"
          dataKey="p50"
          name="P50"
          stroke={CHART_COLORS.blue}
          strokeWidth={2}
          dot={showDots}
          activeDot={{ r: 4 }}
        />
        <Line
          type="monotone"
          dataKey="p95"
          name="P95"
          stroke={CHART_COLORS.amber}
          strokeWidth={2}
          dot={showDots}
          activeDot={{ r: 4 }}
        />
        <Line
          type="monotone"
          dataKey="p99"
          name="P99"
          stroke={CHART_COLORS.red}
          strokeWidth={2}
          dot={showDots}
          activeDot={{ r: 4 }}
        />
      </LineChart>
    </ChartContainer>
  );
}
