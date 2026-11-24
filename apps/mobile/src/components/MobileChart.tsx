import React from 'react';
import { View, Text, StyleSheet, SafeAreaView, Dimensions } from 'react-native';
import type { ChartDataPoint } from './types';

interface MobileChartProps {
  title: string;
  data: ChartDataPoint[];
  type?: 'bar' | 'line' | 'pie';
  height?: number;
}

export function MobileChart({ title, data, type = 'bar', height = 300 }: MobileChartProps) {
  const maxValue = Math.max(...data.map((d) => d.value));

  if (type === 'bar') {
    return <BarChart title={title} data={data} height={height} maxValue={maxValue} />;
  }

  if (type === 'pie') {
    return <PieChart title={title} data={data} height={height} />;
  }

  return <BarChart title={title} data={data} height={height} maxValue={maxValue} />;
}

interface ChartProps {
  title: string;
  data: ChartDataPoint[];
  height: number;
  maxValue?: number;
}

function BarChart({ title, data, height, maxValue = 100 }: ChartProps) {
  const chartWidth = Dimensions.get('window').width - 32;
  const barWidth = chartWidth / (data.length * 1.5);

  return (
    <SafeAreaView style={styles.container}>
      <Text style={styles.title}>{title}</Text>

      <View style={[styles.chart, { height }]}>
        <View style={styles.yAxis}>
          <Text style={styles.yAxisLabel}>{maxValue}</Text>
          <Text style={styles.yAxisLabel}>{Math.floor(maxValue / 2)}</Text>
          <Text style={styles.yAxisLabel}>0</Text>
        </View>

        <View style={styles.chartArea}>
          {data.map((dataPoint, index) => {
            const barHeight = (dataPoint.value / maxValue) * (height - 60);

            return (
              <View key={index} style={styles.barContainer}>
                <View
                  style={[
                    styles.bar,
                    {
                      height: barHeight,
                      backgroundColor: dataPoint.color || '#2563eb',
                      width: barWidth,
                    },
                  ]}
                />
                <Text style={styles.barLabel} numberOfLines={1}>
                  {dataPoint.label}
                </Text>
              </View>
            );
          })}
        </View>
      </View>

      <View style={styles.legend}>
        {data.map((dataPoint, index) => (
          <View key={index} style={styles.legendItem}>
            <View style={[styles.legendColor, { backgroundColor: dataPoint.color || '#2563eb' }]} />
            <Text style={styles.legendLabel}>
              {dataPoint.label}: {dataPoint.value}
            </Text>
          </View>
        ))}
      </View>
    </SafeAreaView>
  );
}

function PieChart({ title, data }: ChartProps) {
  const total = data.reduce((sum, d) => sum + d.value, 0);
  const radius = 80;
  const circumference = 2 * Math.PI * radius;

  let currentAngle = 0;

  return (
    <SafeAreaView style={styles.container}>
      <Text style={styles.title}>{title}</Text>

      <View style={styles.pieChartContainer}>
        <View style={styles.pieLegend}>
          {data.map((dataPoint, index) => {
            const percentage = ((dataPoint.value / total) * 100).toFixed(1);
            const color = dataPoint.color || getDefaultColor(index);

            return (
              <View key={index} style={styles.pieLegendItem}>
                <View style={[styles.pieLegendColor, { backgroundColor: color }]} />
                <Text style={styles.pieLegendLabel}>{dataPoint.label}</Text>
                <Text style={styles.pieLegendValue}>{percentage}%</Text>
              </View>
            );
          })}
        </View>
      </View>

      <View style={styles.statsContainer}>
        <Text style={styles.statsTitle}>Statistics</Text>
        {data.map((dataPoint, index) => (
          <View key={index} style={styles.statRow}>
            <View
              style={[
                styles.statColor,
                { backgroundColor: dataPoint.color || getDefaultColor(index) },
              ]}
            />
            <Text style={styles.statLabel}>{dataPoint.label}</Text>
            <Text style={styles.statValue}>{dataPoint.value}</Text>
          </View>
        ))}
      </View>
    </SafeAreaView>
  );
}

function getDefaultColor(index: number): string {
  const colors = ['#2563eb', '#dc2626', '#16a34a', '#ea580c', '#7c3aed', '#0891b2'];
  return colors[index % colors.length];
}

const styles = StyleSheet.create({
  container: {
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  title: {
    fontSize: 18,
    fontWeight: '700',
    color: '#111827',
    marginBottom: 16,
  },
  chart: {
    flexDirection: 'row',
    marginBottom: 16,
    borderLeftWidth: 1,
    borderBottomWidth: 1,
    borderColor: '#d1d5db',
  },
  yAxis: {
    width: 40,
    justifyContent: 'space-between',
    alignItems: 'flex-end',
    paddingRight: 8,
    paddingVertical: 8,
  },
  yAxisLabel: {
    fontSize: 10,
    color: '#9ca3af',
  },
  chartArea: {
    flex: 1,
    flexDirection: 'row',
    justifyContent: 'space-around',
    alignItems: 'flex-end',
    paddingHorizontal: 8,
  },
  barContainer: {
    alignItems: 'center',
    flex: 1,
  },
  bar: {
    borderRadius: 4,
    marginBottom: 8,
  },
  barLabel: {
    fontSize: 10,
    color: '#6b7280',
    textAlign: 'center',
    maxWidth: 40,
  },
  legend: {
    marginBottom: 16,
  },
  legendItem: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 8,
  },
  legendColor: {
    width: 12,
    height: 12,
    borderRadius: 2,
    marginRight: 8,
  },
  legendLabel: {
    fontSize: 13,
    color: '#374151',
  },
  pieChartContainer: {
    alignItems: 'center',
    marginVertical: 24,
  },
  pieLegend: {
    paddingHorizontal: 12,
    gap: 8,
  },
  pieLegendItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  pieLegendColor: {
    width: 12,
    height: 12,
    borderRadius: 2,
  },
  pieLegendLabel: {
    fontSize: 13,
    color: '#374151',
    flex: 1,
  },
  pieLegendValue: {
    fontSize: 13,
    fontWeight: '600',
    color: '#111827',
  },
  statsContainer: {
    backgroundColor: '#f9fafb',
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 12,
  },
  statsTitle: {
    fontSize: 14,
    fontWeight: '600',
    color: '#111827',
    marginBottom: 8,
  },
  statRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: '#e5e7eb',
  },
  statColor: {
    width: 8,
    height: 8,
    borderRadius: 2,
    marginRight: 8,
  },
  statLabel: {
    fontSize: 13,
    color: '#6b7280',
    flex: 1,
  },
  statValue: {
    fontSize: 13,
    fontWeight: '600',
    color: '#111827',
  },
});
