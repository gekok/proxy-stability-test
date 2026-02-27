'use client';

import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ReferenceArea } from 'recharts';
import { SummarySnapshot } from '@/types';
import { ChartContainer } from './ChartContainer';
import { ChartTooltip } from './ChartTooltip';
import { CHART_COLORS } from './chart-utils';

interface ScoreHistoryChartProps {
  data: SummarySnapshot[];
  loading?: boolean;
}

export function ScoreHistoryChart({ data, loading }: ScoreHistoryChartProps) {
  return (
    <ChartContainer
      title="Score History"
      height={300}
      loading={loading}
      empty={data.length < 2}
      emptyMessage="Need at least 2 data points for score history"
    >
      <LineChart data={data} margin={{ top: 5, right: 20, left: 10, bottom: 5 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
        {/* Grade threshold bands */}
        <ReferenceArea y1={0.9} y2={1.0} fill="#10b981" fillOpacity={0.08} />
        <ReferenceArea y1={0.75} y2={0.9} fill="#3b82f6" fillOpacity={0.08} />
        <ReferenceArea y1={0.6} y2={0.75} fill="#f59e0b" fillOpacity={0.08} />
        <ReferenceArea y1={0.4} y2={0.6} fill="#f97316" fillOpacity={0.08} />
        <ReferenceArea y1={0} y2={0.4} fill="#ef4444" fillOpacity={0.08} />
        <XAxis dataKey="time" fontSize={12} />
        <YAxis domain={[0, 1]} fontSize={12} tickFormatter={(v: number) => v.toFixed(1)} />
        <Tooltip content={<ChartTooltip formatter={(v) => v.toFixed(3)} />} />
        <Line
          type="monotone"
          dataKey="score_total"
          name="Total Score"
          stroke={CHART_COLORS.blue}
          strokeWidth={2}
          dot={false}
        />
      </LineChart>
    </ChartContainer>
  );
}
