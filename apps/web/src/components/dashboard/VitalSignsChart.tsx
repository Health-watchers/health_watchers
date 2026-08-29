'use client';

import { useEffect, useRef } from 'react';
import { formatDate } from '@/lib/dateUtils';

export interface VitalSign {
  timestamp: Date;
  value: number;
  unit: string;
}

export interface VitalSignsData {
  name: string;
  readings: VitalSign[];
  referenceMin: number;
  referenceMax: number;
  unit: string;
  color: string;
}

interface VitalSignsChartProps {
  data: VitalSignsData[];
  height?: number;
  showLegend?: boolean;
  showGrid?: boolean;
}

export function VitalSignsChart({
  data,
  height = 300,
  showLegend = true,
  showGrid = true,
}: VitalSignsChartProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    if (!canvasRef.current || data.length === 0) return;

    const canvas = canvasRef.current;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    // Set canvas size
    const rect = canvas.parentElement?.getBoundingClientRect();
    const width = rect?.width || 800;
    canvas.width = width;
    canvas.height = height;

    const padding = { top: 40, right: 40, bottom: 40, left: 60 };
    const chartWidth = width - padding.left - padding.right;
    const chartHeight = height - padding.top - padding.bottom;

    // Find min/max values for y-axis
    let minValue = Infinity;
    let maxValue = -Infinity;

    data.forEach((series) => {
      series.readings.forEach((reading) => {
        minValue = Math.min(minValue, reading.value);
        maxValue = Math.max(maxValue, reading.value);
      });
    });

    // Add some padding to the range
    const yRange = maxValue - minValue;
    minValue -= yRange * 0.1;
    maxValue += yRange * 0.1;

    // Draw background
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, width, height);

    // Draw grid
    if (showGrid) {
      ctx.strokeStyle = '#e5e7eb';
      ctx.lineWidth = 1;

      // Horizontal grid lines
      for (let i = 0; i <= 5; i++) {
        const y = padding.top + (chartHeight / 5) * i;
        ctx.beginPath();
        ctx.moveTo(padding.left, y);
        ctx.lineTo(width - padding.right, y);
        ctx.stroke();
      }

      // Vertical grid lines
      const maxReadings = Math.max(...data.map((d) => d.readings.length));
      for (let i = 0; i <= maxReadings; i++) {
        const x = padding.left + (chartWidth / maxReadings) * i;
        ctx.beginPath();
        ctx.moveTo(x, padding.top);
        ctx.lineTo(x, height - padding.bottom);
        ctx.stroke();
      }
    }

    // Draw axes
    ctx.strokeStyle = '#374151';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(padding.left, padding.top);
    ctx.lineTo(padding.left, height - padding.bottom);
    ctx.lineTo(width - padding.right, height - padding.bottom);
    ctx.stroke();

    // Draw y-axis labels
    ctx.fillStyle = '#6b7280';
    ctx.font = '12px sans-serif';
    ctx.textAlign = 'right';
    for (let i = 0; i <= 5; i++) {
      const y = padding.top + (chartHeight / 5) * i;
      const value = maxValue - ((maxValue - minValue) / 5) * i;
      ctx.fillText(value.toFixed(1), padding.left - 10, y + 4);
    }

    // Draw reference range
    data.forEach((series, seriesIndex) => {
      const refMinY =
        padding.top + ((maxValue - series.referenceMin) / (maxValue - minValue)) * chartHeight;
      const refMaxY =
        padding.top + ((maxValue - series.referenceMax) / (maxValue - minValue)) * chartHeight;

      ctx.fillStyle = `${series.color}20`;
      ctx.fillRect(
        padding.left,
        Math.min(refMinY, refMaxY),
        chartWidth,
        Math.abs(refMaxY - refMinY)
      );

      ctx.strokeStyle = `${series.color}80`;
      ctx.setLineDash([5, 5]);
      ctx.beginPath();
      ctx.moveTo(padding.left, refMinY);
      ctx.lineTo(width - padding.right, refMinY);
      ctx.stroke();

      ctx.beginPath();
      ctx.moveTo(padding.left, refMaxY);
      ctx.lineTo(width - padding.right, refMaxY);
      ctx.stroke();
      ctx.setLineDash([]);
    });

    // Draw data lines
    data.forEach((series) => {
      if (series.readings.length === 0) return;

      ctx.strokeStyle = series.color;
      ctx.lineWidth = 2;
      ctx.lineJoin = 'round';

      ctx.beginPath();
      series.readings.forEach((reading, index) => {
        const x = padding.left + (chartWidth / (series.readings.length - 1 || 1)) * index;
        const y = padding.top + ((maxValue - reading.value) / (maxValue - minValue)) * chartHeight;

        if (index === 0) {
          ctx.moveTo(x, y);
        } else {
          ctx.lineTo(x, y);
        }
      });
      ctx.stroke();

      // Draw points
      ctx.fillStyle = series.color;
      series.readings.forEach((reading, index) => {
        const x = padding.left + (chartWidth / (series.readings.length - 1 || 1)) * index;
        const y = padding.top + ((maxValue - reading.value) / (maxValue - minValue)) * chartHeight;

        ctx.beginPath();
        ctx.arc(x, y, 3, 0, Math.PI * 2);
        ctx.fill();
      });
    });

    // Draw legend
    if (showLegend) {
      let legendX = width - padding.right - 150;
      let legendY = padding.top + 10;

      data.forEach((series) => {
        ctx.fillStyle = series.color;
        ctx.fillRect(legendX, legendY, 12, 12);

        ctx.fillStyle = '#1f2937';
        ctx.font = '12px sans-serif';
        ctx.textAlign = 'left';
        ctx.fillText(series.name, legendX + 18, legendY + 10);

        legendY += 20;
      });
    }
  }, [data, height, showLegend, showGrid]);

  return (
    <div className="rounded-lg border border-gray-200 bg-white p-6 dark:border-gray-700 dark:bg-gray-800">
      <h3 className="mb-4 text-lg font-semibold text-gray-900 dark:text-gray-100">
        Vital Signs Trends
      </h3>

      <div className="overflow-x-auto">
        <canvas ref={canvasRef} className="w-full" />
      </div>

      <div className="mt-4 grid grid-cols-2 gap-4 md:grid-cols-4">
        {data.map((series, index) => (
          <div
            key={index}
            className="rounded-lg border border-gray-200 bg-gray-50 p-4 dark:border-gray-700 dark:bg-gray-700"
          >
            <div className="flex items-center gap-2">
              <div className="h-3 w-3 rounded-full" style={{ backgroundColor: series.color }} />
              <span className="text-sm font-medium text-gray-700 dark:text-gray-300">
                {series.name}
              </span>
            </div>
            {series.readings.length > 0 && (
              <div className="mt-2 text-2xl font-bold text-gray-900 dark:text-gray-100">
                {series.readings[series.readings.length - 1].value}
                <span className="ml-1 text-sm text-gray-500 dark:text-gray-400">{series.unit}</span>
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
