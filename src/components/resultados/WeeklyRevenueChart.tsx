import React from 'react';
import { Card, CardHeader, CardTitle, CardContent } from '../Card';
import { weeklyRevenue } from '../../data/resultados';

const WIDTH = 720;
const HEIGHT = 260;
const PAD = { top: 16, right: 24, bottom: 36, left: 64 };
const Y_MIN = 600;
const Y_MAX = 1400;
const Y_STEP = 200;

const yTicks = Array.from({ length: (Y_MAX - Y_MIN) / Y_STEP + 1 }, (_, i) => Y_MIN + i * Y_STEP);
const plotW = WIDTH - PAD.left - PAD.right;
const plotH = HEIGHT - PAD.top - PAD.bottom;

function x(i: number) {
  return PAD.left + i / (weeklyRevenue.length - 1) * plotW;
}

function y(v: number) {
  return PAD.top + plotH - (v - Y_MIN) / (Y_MAX - Y_MIN) * plotH;
}

function path(key: 'setembro' | 'agosto') {
  return weeklyRevenue.map((p, i) => `${i === 0 ? 'M' : 'L'} ${x(i)} ${y(p[key])}`).join(' ');
}

function brl(v: number) {
  return `R$ ${v.toLocaleString('pt-BR')}`;
}

export function WeeklyRevenueChart() {
  const summary = weeklyRevenue.
  map((p) => `${p.week}: setembro ${brl(p.setembro)}, agosto ${brl(p.agosto)}`).
  join('; ');

  return (
    <Card as="section" padding="lg">
      <CardHeader>
        <CardTitle as="h2">Receita gerada por semana</CardTitle>
        <div className="flex items-center gap-4 text-xs font-semibold text-text-secondary">
          <span className="flex items-center gap-1.5">
            <svg width="20" height="4" aria-hidden="true">
              <line x1="0" y1="2" x2="20" y2="2" stroke="#0E7490" strokeWidth="3" strokeLinecap="round" />
            </svg>
            Setembro
          </span>
          <span className="flex items-center gap-1.5">
            <svg width="20" height="4" aria-hidden="true">
              <line x1="0" y1="2" x2="20" y2="2" stroke="#B5D3CF" strokeWidth="3" strokeDasharray="4 3" />
            </svg>
            Agosto
          </span>
        </div>
      </CardHeader>
      <CardContent>
        <svg viewBox={`0 0 ${WIDTH} ${HEIGHT}`} className="h-auto w-full" role="img" aria-label={summary}>
          {yTicks.map((t) =>
          <g key={t}>
              <line x1={PAD.left} x2={WIDTH - PAD.right} y1={y(t)} y2={y(t)} stroke="#EAF2F1" strokeWidth="1" />
              <text x={PAD.left - 12} y={y(t)} textAnchor="end" dominantBaseline="middle" fontSize="12" fill="#587371" fontWeight="600">
                {brl(t)}
              </text>
            </g>
          )}

          {weeklyRevenue.map((p, i) =>
          <text key={p.week} x={x(i)} y={HEIGHT - 10} textAnchor="middle" fontSize="12" fill="#587371" fontWeight="600">
              {p.week}
            </text>
          )}

          <path d={path('agosto')} fill="none" stroke="#B5D3CF" strokeWidth="2.5" strokeDasharray="6 5" strokeLinecap="round" strokeLinejoin="round" />
          <path d={path('setembro')} fill="none" stroke="#0E7490" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" />

          {weeklyRevenue.map((p, i) =>
          <g key={p.week}>
              <circle cx={x(i)} cy={y(p.agosto)} r="3.5" fill="#FFFFFF" stroke="#B5D3CF" strokeWidth="2" />
              <circle cx={x(i)} cy={y(p.setembro)} r="4.5" fill="#FFFFFF" stroke="#0E7490" strokeWidth="2.5" />
            </g>
          )}
        </svg>
      </CardContent>
    </Card>);

}