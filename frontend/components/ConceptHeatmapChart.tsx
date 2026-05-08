'use client';

import { intensityToHsl } from '@/lib/utils';
import type { HeatmapPoint } from '@/lib/types';

interface Props {
  data: HeatmapPoint[];
  onBarClick: (videoId: string) => void;
}

export function ConceptHeatmapChart({ data, onBarClick }: Props) {
  if (data.length === 0) {
    return <p className="text-xs text-slate-400 italic">No data for this term</p>;
  }

  return (
    <div>
      <p className="text-[10px] text-slate-400 mb-1">
        Coverage across {data.length} lectures
      </p>
      <div className="flex gap-0.5 h-8 items-end">
        {data.map((point) => (
          <button
            key={point.video_id}
            title={`Lecture ${point.position} — intensity ${(point.intensity * 100).toFixed(0)}%`}
            onClick={() => onBarClick(point.video_id)}
            className="flex-1 min-w-[4px] rounded-sm hover:opacity-80 transition-opacity cursor-pointer"
            style={{
              backgroundColor: intensityToHsl(point.intensity),
              height: `${Math.max(20, point.intensity * 100)}%`,
            }}
          />
        ))}
      </div>
      {/* X-axis labels: show every 5th video number */}
      <div className="flex gap-0.5 mt-1">
        {data.map((point, i) => (
          <div key={point.video_id} className="flex-1 text-center">
            {(i + 1) % 5 === 0 || i === 0 ? (
              <span className="text-[8px] text-slate-400">{point.position}</span>
            ) : null}
          </div>
        ))}
      </div>
    </div>
  );
}
