'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Modal } from '@/components/ui/modal';
import { Field } from '@/components/ui/input';

const COLORS = ['#6366f1', '#10b981', '#f59e0b', '#ef4444', '#3b82f6', '#8b5cf6', '#ec4899', '#14b8a6', '#64748b'];
const slugify = (s: string) => s.toLowerCase().trim().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '');

export function AddBrandButton() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [name, setName] = useState('');
  const [slug, setSlug] = useState('');
  const [color, setColor] = useState(COLORS[0]);
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState('');

  const save = async () => {
    if (!name.trim()) { setErr('ใส่ชื่อแบรนด์'); return; }
    setSaving(true); setErr('');
    const r = await fetch('/api/brands', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: name.trim(), slug: (slug.trim() || slugify(name)), color }),
    });
    setSaving(false);
    if (r.ok) { setOpen(false); setName(''); setSlug(''); router.refresh(); return; }
    const d = await r.json().catch(() => ({}));
    setErr(d.error || 'เพิ่มแบรนด์ไม่สำเร็จ');
  };

  return (
    <>
      <button onClick={() => setOpen(true)} className="bg-indigo-600 text-white text-xs px-3 py-1.5 rounded-lg font-semibold hover:bg-indigo-700">+ เพิ่มแบรนด์</button>
      {open && (
        <Modal open onClose={() => setOpen(false)} title="เพิ่มแบรนด์ใหม่"
          footer={<><Button variant="ghost" onClick={() => setOpen(false)}>ยกเลิก</Button><Button onClick={save} loading={saving}>เพิ่ม</Button></>}>
          <div className="space-y-4">
            {err && <div className="text-xs text-rose-600 bg-rose-50 p-2 rounded">{err}</div>}
            <Field label="ชื่อแบรนด์"><input autoFocus value={name} onChange={e => { setName(e.target.value); if (!slug) setSlug(slugify(e.target.value)); }} className="w-full text-sm rounded-lg border border-slate-200 px-3 py-2" placeholder="เช่น Monday Cart" /></Field>
            <Field label="Slug (ใช้ในระบบ)"><input value={slug} onChange={e => setSlug(slugify(e.target.value))} className="w-full text-sm rounded-lg border border-slate-200 px-3 py-2 font-mono" placeholder="monday_cart" /></Field>
            <div>
              <div className="text-xs font-semibold text-slate-700 mb-1.5">สี</div>
              <div className="flex gap-2 flex-wrap">
                {COLORS.map(c => <button key={c} type="button" onClick={() => setColor(c)} style={{ background: c }} className={`w-7 h-7 rounded-lg ${color === c ? 'ring-2 ring-offset-2 ring-slate-400' : ''}`} />)}
              </div>
            </div>
          </div>
        </Modal>
      )}
    </>
  );
}
