'use client';

import {
  RadarChart, PolarGrid, PolarAngleAxis, PolarRadiusAxis, Radar, Legend, Tooltip,
} from 'recharts';
import { ProviderComparison } from '@/types';
import { ChartContainer } from '@/components/charts/ChartContainer';

const PROVIDER_COLORS = ['#3b82f6', '#ef4444', '#10b981', '#f59e0b', '#8b5cf6'];

const AXES = ['Uptime', 'Latency', 'Jitter', 'WS', 'Security'] as const;

interface RadarCompareChartProps {
  data: ProviderComparison[];
}

export function RadarCompareChart({ data }: RadarCompareChartProps) {
  if (data.length === 0) {
    return (
      <ChartContainer title="Score Comparison" height={400} empty emptyMessage="No comparison data">
        <div />
      </ChartContainer>
    );
  }

  // Transform data for radar chart: one entry per axis
  const radarData = AXES.map((axis) => {
    const entry: Record<string, unknown> = { axis };
    for (const provider of data) {
      const key = `avg_score_${axis.toLowerCase()}` as keyof ProviderComparison;
      entry[provider.provider_name] = Number(provider[key]) || 0;
    }
    return entry;
  });

  return (
    <ChartContainer title="Score Comparison" height={400}>
      <RadarChart data={radarData} cx="50%" cy="50%">
        <PolarGrid stroke="#e5e7eb" />
        <PolarAngleAxis dataKey="axis" fontSize={12} />
        <PolarRadiusAxis domain={[0, 1]} fontSize={10} tickFormatter={(v: number) => v.toFixed(1)} />
        <Tooltip />
        <Legend />
        {data.map((provider, i) => (
          <Radar
            key={provider.provider_id}
            name={provider.provider_name}
            dataKey={provider.provider_name}
            stroke={PROVIDER_COLORS[i % PROVIDER_COLORS.length]}
            fill={PROVIDER_COLORS[i % PROVIDER_COLORS.length]}
            fillOpacity={0.15}
            strokeWidth={2}
          />
        ))}
      </RadarChart>
    </ChartContainer>
  );
}
