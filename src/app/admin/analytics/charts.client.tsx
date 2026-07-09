'use client';

import { useEffect, useState } from 'react';
import { Card } from '@/components/ui/card';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend, PieChart, Pie, Cell } from 'recharts';
import { CHANNEL_META } from '@/lib/utils';

export function AnalyticsCharts() {
  const [series, setSeries] = useState<{ day: string; customer: number; agent: number }[]>([]);
  const [chans, setChans] = useState<{ channel: string; n: number }[]>([]);
  const [topics, setTopics] = useState<Record<string, number>>({});

  useEffect(() => {
    fetch('/api/analytics/timeseries').then(r => r.json()).then(setSeries).catch(() => {});
    fetch('/api/analytics/channels').then(r => r.json()).then(setChans).catch(() => {});
    fetch('/api/analytics/topics').then(r => r.json()).then(setTopics).catch(() => {});
  }, []);

  const topicsArr = Object.entries(topics).sort((a, b) => b[1] - a[1]);

  return (
    <>
      <Card className="p-5">
        <h3 className="font-semibold mb-3">📊 Message Volume</h3>
        <ResponsiveContainer width="100%" height={260}>
          <BarChart data={series}>
            <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
            <XAxis dataKey="day" /><YAxis /><Tooltip /><Legend />
            <Bar dataKey="customer" name="ลูกค้า" fill="#6366f1" />
            <Bar dataKey="agent" name="ทีม/แอดมิน" fill="#94a3b8" />
          </BarChart>
        </ResponsiveContainer>
      </Card>

      <div className="grid grid-cols-2 gap-4">
        <Card className="p-5">
          <h3 className="font-semibold mb-3">สัดส่วนช่องทาง</h3>
          <ResponsiveContainer width="100%" height={240}>
            <PieChart>
              <Pie data={chans} dataKey="n" nameKey="channel" cx="50%" cy="50%" innerRadius={45} outerRadius={85}>
                {chans.map((e, i) => <Cell key={i} fill={CHANNEL_META[e.channel]?.color || '#94a3b8'} />)}
              </Pie>
              <Tooltip />
            </PieChart>
          </ResponsiveContainer>
        </Card>

        <Card className="p-5">
          <h3 className="font-semibold mb-3">🏷️ Top Topics</h3>
          <div className="space-y-2">
            {topicsArr.map(([t, v], i) => (
              <div key={t} className="flex items-center gap-3 p-2 rounded-lg hover:bg-slate-50">
                <div className="w-7 h-7 rounded-full bg-indigo-100 text-indigo-700 flex items-center justify-center text-xs font-bold">{i + 1}</div>
                <div className="flex-1 text-sm">{t}</div>
                <span className="text-xs font-semibold">{v}</span>
              </div>
            ))}
            {!topicsArr.length && <div className="text-sm text-slate-400">ยังไม่มีข้อมูล</div>}
          </div>
        </Card>
      </div>
    </>
  );
}
