'use client';

import { useEffect, useState } from 'react';
import { Card, CardHeader } from '@/components/ui/card';
import { Loader2 } from 'lucide-react';

interface Brand { id: string; name: string; color?: string }

export function GreetingNames() {
  const [brands, setBrands] = useState<Brand[]>([]);
  const [names, setNames] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [saved, setSaved] = useState<string | null>(null);

  useEffect(() => {
    Promise.all([
      fetch('/api/brands').then(r => r.ok ? r.json() : []),
      fetch('/api/greetings').then(r => r.ok ? r.json() : { greetings: {} }),
    ]).then(([bs, gs]) => {
      setBrands(Array.isArray(bs) ? bs : (bs?.data || []));
      setNames(gs?.greetings || {});
    }).catch(() => {}).finally(() => setLoading(false));
  }, []);

  const save = (brandId: string, value: string) => {
    fetch('/api/greetings', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ brand_id: brandId, display_name: value }) })
      .then(() => { setSaved(brandId); setTimeout(() => setSaved(s => (s === brandId ? null : s)), 1200); }).catch(() => {});
  };

  return (
    <Card>
      <CardHeader title="ชื่อทักทายตามแบรนด์" subtitle='ตั้งชื่อที่ใช้ทักลูกค้าแยกตามร้าน — เช่น "นุ่น" → "สวัสดีค่ะ แอดมินนุ่นยินดีให้บริการค่ะ" (เว้นว่าง = ใช้ชื่อโปรไฟล์)' />
      <div className="p-4">
        {loading ? (
          <div className="flex items-center gap-2 text-slate-400 text-sm"><Loader2 className="w-4 h-4 animate-spin" /> กำลังโหลด…</div>
        ) : (
          <div className="grid grid-cols-2 gap-3">
            {brands.map(b => (
              <div key={b.id} className="flex items-center gap-2">
                <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ background: b.color || '#94a3b8' }} />
                <span className="text-sm text-slate-600 w-28 truncate shrink-0">{b.name}</span>
                <input
                  defaultValue={names[b.id] || ''}
                  onBlur={e => { const v = e.target.value.trim(); if (v !== (names[b.id] || '')) { setNames(n => ({ ...n, [b.id]: v })); save(b.id, v); } }}
                  placeholder="ชื่อทักทาย…"
                  className="flex-1 text-sm rounded-lg border border-slate-200 px-2.5 py-1.5 focus:ring-2 focus:ring-brand-400" />
                {saved === b.id && <span className="text-[11px] text-emerald-600 shrink-0">✓</span>}
              </div>
            ))}
            {!brands.length && <div className="text-sm text-slate-400 col-span-2">ยังไม่มีแบรนด์</div>}
          </div>
        )}
      </div>
    </Card>
  );
}
