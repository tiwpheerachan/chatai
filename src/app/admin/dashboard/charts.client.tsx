'use client';

import { useEffect, useState } from 'react';
import { Card } from '@/components/ui/card';
import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';
import { Flame } from 'lucide-react';

export function DashboardCharts() {
  const [series, setSeries] = useState<{ day: string; customer: number; agent: number }[]>([]);
  const [topics, setTopics] = useState<Record<string, number>>({});

  useEffect(() => {
    fetch('/api/analytics/timeseries').then(r => r.json()).then(setSeries).catch(() => {});
    fetch('/api/analytics/topics').then(r => r.json()).then(setTopics).catch(() => {});
  }, []);

  const topicsArr = Object.entries(topics).sort((a, b) => b[1] - a[1]);
  const total = topicsArr.reduce((s, [, v]) => s + v, 0) || 1;

  return (
    <div className="grid grid-cols-3 gap-4">
      <Card className="col-span-2 p-5">
        <h3 className="font-semibold text-slate-900 mb-3">ปริมาณข้อความ 7 วัน</h3>
        <ResponsiveContainer width="100%" height={240}>
          <AreaChart data={series}>
            <defs>
              <linearGradient id="aiGrad" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="#6366f1" stopOpacity={0.4} />
                <stop offset="100%" stopColor="#6366f1" stopOpacity={0} />
              </linearGradient>
            </defs>
            <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
            <XAxis dataKey="day" stroke="#94a3b8" fontSize={11} />
            <YAxis stroke="#94a3b8" fontSize={11} />
            <Tooltip />
            <Area type="monotone" dataKey="customer" stroke="#6366f1" fill="url(#aiGrad)" strokeWidth={2} name="ลูกค้า" />
            <Area type="monotone" dataKey="agent" stroke="#10b981" fill="#d1fae5" strokeWidth={2} name="ร้าน/ทีม" />
          </AreaChart>
        </ResponsiveContainer>
      </Card>

      <Card className="p-5">
        <h3 className="font-semibold text-slate-900 mb-3 flex items-center gap-1.5"><Flame className="w-4 h-4 text-orange-500" /> หัวข้อยอดนิยม</h3>
        <div className="space-y-3">
          {topicsArr.map(([t, v]) => (
            <div key={t}>
              <div className="flex justify-between text-xs mb-1">
                <span className="text-slate-700">{t}</span>
                <span className="font-semibold">{v}</span>
              </div>
              <div className="h-2 bg-slate-100 rounded-full overflow-hidden">
                <div className="h-full bg-indigo-500 rounded-full" style={{ width: `${(v / total) * 100}%` }} />
              </div>
            </div>
          ))}
          {!topicsArr.length && <div className="text-sm text-slate-400">รอข้อมูล...</div>}
        </div>
      </Card>
    </div>
  );
}
