'use client';

import { RadialBarChart, RadialBar, PolarAngleAxis } from 'recharts';
import { getScoreGrade } from '@/types';
import { scoreColor } from './chart-utils';

interface ScoreGaugeProps {
  score: number | null | undefined;
  size?: number;
}

export function ScoreGauge({ score, size = 200 }: ScoreGaugeProps) {
  if (score == null) {
    return (
      <div className="flex items-center justify-center" style={{ width: size, height: size }}>
        <span className="text-gray-400 text-sm">No score</span>
      </div>
    );
  }

  const pct = Math.round(score * 100);
  const grade = getScoreGrade(score);
  const color = scoreColor(score);

  const data = [{ value: pct, fill: color }];

  if (process.env.NODE_ENV === 'development') {
    console.debug('[charts.score_gauge] Score gauge rendered', { score, grade, color });
  }

  return (
    <div className="relative" style={{ width: size, height: size }}>
      <RadialBarChart
        width={size}
        height={size}
        cx={size / 2}
        cy={size / 2}
        innerRadius={size * 0.35}
        outerRadius={size * 0.45}
        barSize={12}
        data={data}
        startAngle={90}
        endAngle={-270}
      >
        <PolarAngleAxis type="number" domain={[0, 100]} angleAxisId={0} tick={false} />
        <RadialBar
          background={{ fill: '#f3f4f6' }}
          dataKey="value"
          cornerRadius={6}
          angleAxisId={0}
        />
      </RadialBarChart>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <span className="text-2xl font-bold font-mono" style={{ color }}>{pct}</span>
        <span className="text-lg font-bold" style={{ color }}>{grade}</span>
      </div>
    </div>
  );
}
