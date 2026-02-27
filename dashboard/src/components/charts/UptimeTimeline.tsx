'use client';

import {
  ComposedChart, Area, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend,
} from 'recharts';
import { UptimeDataPoint } from '@/types';
import { ChartContainer } from './ChartContainer';
import { ChartTooltip } from './ChartTooltip';
import { formatPercent } from './chart-utils';

interface UptimeTimelineProps {
  data: UptimeDataPoint[];
  loading?: boolean;
}

export function UptimeTimeline({ data, loading }: UptimeTimelineProps) {
  const showDots = data.length <= 5;
  return (
    <ChartContainer
      title="Uptime Timeline"
      height={300}
      loading={loading}
      empty={data.length === 0}
      emptyMessage="No uptime data yet"
    >
      <ComposedChart data={data} margin={{ top: 5, right: 20, left: 10, bottom: 5 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
        <XAxis dataKey="time" fontSize={12} />
        <YAxis yAxisId="count" fontSize={12} orientation="left" />
        <YAxis
          yAxisId="ratio"
          fontSize={12}
          orientation="right"
          domain={[0, 1]}
          tickFormatter={(v: number) => formatPercent(v)}
        />
        <Tooltip content={<ChartTooltip formatter={(v, name) => {
          if (name === 'Uptime %') return formatPercent(v);
          return String(v);
        }} />} />
        <Legend />
        <Area
          yAxisId="count"
          type="monotone"
          dataKey="success_count"
          name="Success"
          stackId="1"
          fill="#10b981"
          stroke="#10b981"
          fillOpacity={0.6}
        />
        <Area
          yAxisId="count"
          type="monotone"
          dataKey="error_count"
          name="Errors"
          stackId="1"
          fill="#ef4444"
          stroke="#ef4444"
          fillOpacity={0.6}
        />
        <Line
          yAxisId="ratio"
          type="monotone"
          dataKey="uptime_ratio"
          name="Uptime %"
          stroke="#6366f1"
          strokeWidth={2}
          dot={showDots}
          activeDot={{ r: 4 }}
        />
      </ComposedChart>
    </ChartContainer>
  );
}
