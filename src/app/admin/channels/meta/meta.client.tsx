'use client';

import { useEffect, useState } from 'react';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Fi } from '@/components/ui/fi';
import { Loader2 } from 'lucide-react';

interface Brand { id: string; name: string; slug: string }
interface Page { id: string; name: string; category: string | null; suggested_brand_id: string | null; connected: boolean; connected_brand_id: string | null; status: string | null }
interface Row extends Page { brandId: string; on: boolean }

export function MetaConnect() {
  const [loading, setLoading] = useState(true);
  const [configured, setConfigured] = useState(true);
  const [brands, setBrands] = useState<Brand[]>([]);
  const [rows, setRows] = useState<Row[]>([]);
  const [saving, setSaving] = useState(false);
  const [results, setResults] = useState<Record<string, { ok: boolean; subscribed?: boolean; error?: string }> | null>(null);

  const load = () => {
    setLoading(true); setResults(null);
    fetch('/api/meta/pages').then(r => r.json()).then(d => {
      setConfigured(d.configured !== false);
      setBrands(d.brands || []);
      setRows((d.pages || []).map((p: Page) => ({ ...p, brandId: p.connected_brand_id || p.suggested_brand_id || '', on: p.connected })));
    }).catch(() => setConfigured(false)).finally(() => setLoading(false));
  };
  useEffect(load, []);

  const setRow = (id: string, patch: Partial<Row>) => setRows(rs => rs.map(r => r.id === id ? { ...r, ...patch } : r));

  const save = async () => {
    setSaving(true); setResults(null);
    const links = rows.filter(r => r.on && r.brandId).map(r => ({ page_id: r.id, brand_id: r.brandId }));
    const disconnect = rows.filter(r => !r.on && r.connected).map(r => r.id);
    const r = await fetch('/api/meta/connect', {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ links, disconnect }),
    });
    const d = await r.json().catch(() => ({}));
    setSaving(false);
    const map: Record<string, any> = {};
    for (const x of d.results || []) map[x.page_id] = x;
    setResults(map);
    load();
  };

  if (loading) return <div className="flex items-center gap-2 text-slate-400 text-sm"><Loader2 className="w-4 h-4 animate-spin" /> กำลังโหลดเพจจาก Meta…</div>;

  if (!configured) return (
    <Card className="p-5 text-sm text-slate-600">
      ยังไม่ได้ตั้งค่า <code className="bg-slate-100 px-1 rounded">META_SYSTEM_USER_TOKEN</code> — วาง System-User token ใน Render dashboard ก่อน แล้วรีเฟรชหน้านี้
    </Card>
  );

  const readyCount = rows.filter(r => r.on && r.brandId).length;

  return (
    <div className="space-y-4 max-w-4xl">
      <Card className="p-4 flex items-center justify-between flex-wrap gap-3">
        <div className="text-sm text-slate-600">
          พบ <b>{rows.length}</b> เพจ · เลือกแบรนด์ให้แต่ละเพจแล้วกดเชื่อมต่อ ระบบจะ subscribe เพจเข้า webhook ให้อัตโนมัติ
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" onClick={load}><Fi name="refresh" className="text-sm mr-1" /> รีเฟรช</Button>
          <Button onClick={save} loading={saving} disabled={!readyCount}>บันทึก & เชื่อมต่อ ({readyCount})</Button>
        </div>
      </Card>

      <Card className="overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-slate-50 text-slate-500 text-xs uppercase">
            <tr>
              <th className="text-left px-4 py-3 font-medium">เพจ Facebook</th>
              <th className="text-left px-4 py-3 font-medium">แบรนด์ใน Nexus</th>
              <th className="text-center px-4 py-3 font-medium">เชื่อมต่อ</th>
              <th className="text-left px-4 py-3 font-medium">สถานะ</th>
            </tr>
          </thead>
          <tbody>
            {rows.map(r => {
              const res = results?.[r.id];
              return (
                <tr key={r.id} className="border-t border-slate-100">
                  <td className="px-4 py-2.5">
                    <div className="font-medium text-slate-800 flex items-center gap-1.5"><Fi name="brand-facebook" className="text-blue-600" /> {r.name}</div>
                    <div className="text-[11px] text-slate-400">{r.category || 'Page'} · {r.id}</div>
                  </td>
                  <td className="px-4 py-2.5">
                    <select value={r.brandId} onChange={e => setRow(r.id, { brandId: e.target.value })}
                      className="text-sm rounded-lg border border-slate-200 px-2 py-1.5 min-w-[180px]">
                      <option value="">— เลือกแบรนด์ —</option>
                      {brands.map(b => <option key={b.id} value={b.id}>{b.name}</option>)}
                    </select>
                    {!r.brandId && <span className="ml-2 text-[11px] text-amber-500">ยังไม่มีแบรนด์ที่ตรง — เลือกเอง หรือสร้างแบรนด์ก่อน</span>}
                  </td>
                  <td className="px-4 py-2.5 text-center">
                    <input type="checkbox" checked={r.on} onChange={e => setRow(r.id, { on: e.target.checked })} className="w-4 h-4" />
                  </td>
                  <td className="px-4 py-2.5">
                    {res ? (
                      res.ok
                        ? <span className="text-xs text-emerald-600 flex items-center gap-1"><Fi name="check" /> {res.subscribed ? 'เชื่อมต่อ + subscribe แล้ว' : 'บันทึกแล้ว (subscribe ไม่ผ่าน)'}</span>
                        : <span className="text-xs text-rose-600" title={res.error}>ผิดพลาด: {(res.error || '').slice(0, 40)}</span>
                    ) : r.connected
                      ? <span className="text-xs text-emerald-600 flex items-center gap-1"><Fi name="check" /> เชื่อมต่ออยู่{r.status && r.status !== 'connected' ? ` (${r.status})` : ''}</span>
                      : <span className="text-xs text-slate-400">ยังไม่เชื่อมต่อ</span>}
                  </td>
                </tr>
              );
            })}
            {!rows.length && <tr><td colSpan={4} className="py-10 text-center text-slate-400">ไม่พบเพจ (ตรวจสอบ token)</td></tr>}
          </tbody>
        </table>
      </Card>

      <p className="text-[11px] text-slate-400">
        ⚠️ ต้องตั้งค่า Webhook URL ใน Meta App: <code className="bg-slate-100 px-1 rounded">/api/webhooks/meta</code> + Verify Token = <code className="bg-slate-100 px-1 rounded">META_VERIFY_TOKEN</code> และ subscribe event <b>messages</b> ให้แอป (ทำครั้งเดียว)
      </p>
    </div>
  );
}
