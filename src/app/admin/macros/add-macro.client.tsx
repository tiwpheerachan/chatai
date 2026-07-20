'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Modal } from '@/components/ui/modal';
import { Field } from '@/components/ui/input';

const inputCls = 'w-full text-sm rounded-lg border border-slate-200 px-3 py-2 focus:ring-2 focus:ring-brand-400';

export function AddMacroButton() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [title, setTitle] = useState('');
  const [shortcut, setShortcut] = useState('');
  const [text, setText] = useState('');
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState('');

  const save = async () => {
    if (!title.trim() || !text.trim()) { setErr('ใส่ชื่อและเนื้อหา'); return; }
    setSaving(true); setErr('');
    const r = await fetch('/api/macros', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ title: title.trim(), shortcut: shortcut.trim() || undefined, text: text.trim() }),
    });
    setSaving(false);
    if (r.ok) { setOpen(false); setTitle(''); setShortcut(''); setText(''); router.refresh(); return; }
    const d = await r.json().catch(() => ({}));
    setErr(d.error || 'เพิ่ม Macro ไม่สำเร็จ');
  };

  return (
    <>
      <button onClick={() => setOpen(true)} className="bg-indigo-600 text-white text-xs px-3 py-1.5 rounded-lg font-semibold hover:bg-indigo-700">+ เพิ่ม Macro</button>
      {open && (
        <Modal open onClose={() => setOpen(false)} title="เพิ่ม Macro (ตอบเร็ว)"
          footer={<><Button variant="ghost" onClick={() => setOpen(false)}>ยกเลิก</Button><Button onClick={save} loading={saving}>เพิ่ม</Button></>}>
          <div className="space-y-4">
            {err && <div className="text-xs text-rose-600 bg-rose-50 p-2 rounded">{err}</div>}
            <div className="grid grid-cols-2 gap-3">
              <Field label="ชื่อ"><input autoFocus value={title} onChange={e => setTitle(e.target.value)} className={inputCls} placeholder="เช่น ทักทาย" /></Field>
              <Field label="Shortcut (พิมพ์ลัด)"><input value={shortcut} onChange={e => setShortcut(e.target.value)} className={inputCls} placeholder="/hello" /></Field>
            </div>
            <Field label="เนื้อหาข้อความ"><textarea value={text} onChange={e => setText(e.target.value)} rows={4} className={inputCls} placeholder="สวัสดีค่ะ ยินดีให้บริการค่ะ 🙏" /></Field>
          </div>
        </Modal>
      )}
    </>
  );
}
