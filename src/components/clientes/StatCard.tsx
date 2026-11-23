import React from 'react';
import { Card } from '../Card';

type StatCardProps = {
  label: string;
  value: string;
};

/** Text-valued stat card that mirrors KpiStatCard for values that are not numbers (e.g. dates). */
export function StatCard({ label, value }: StatCardProps) {
  return (
    <Card padding="lg" className="h-full">
      <p className="text-sm font-medium text-text-secondary">{label}</p>
      <p className="mt-2 text-kpi font-extrabold leading-tight tabular-nums text-text-primary">{value}</p>
    </Card>);

}