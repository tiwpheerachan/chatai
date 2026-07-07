'use client';

import { useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Card, CardHeader } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input, Field } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Avatar } from '@/components/ui/avatar';
import { ChannelIcon } from '@/components/ui/channel-icon';
import { ROLE_LABELS } from '@/lib/rbac';
import { CHANNEL_META } from '@/lib/utils';
import type { EffectiveScope } from '@/lib/permissions';
import type { UserRole } from '@/types/database';
import { Check, ShieldCheck, Upload, Loader2 } from 'lucide-react';

const SWATCHES = ['#6366f1', '#ec4899', '#f59e0b', '#10b981', '#0ea5e9', '#8b5cf6', '#ef4444', '#14b8a6'];

export function ProfileClient({
  profile,
  permissions,
  scope,
}: {
  profile: { name: string; email: string; role: UserRole; avatar: string | null; avatar_color: string | null };
  permissions: string[];
  scope: EffectiveScope;
}) {
  const router = useRouter();
  const fileRef = useRef<HTMLInputElement>(null);
  const [name, setName] = useState(profile.name);
  const [color, setColor] = useState(profile.avatar_color || '#6366f1');
  const [avatar, setAvatar] = useState(profile.avatar);
  const [uploading, setUploading] = useState(false);
  const [pw, setPw] = useState('');
  const [pw2, setPw2] = useState('');
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState<{ type: 'ok' | 'err'; text: string } | null>(null);

  const uploadAvatar = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true); setMsg(null);
    const fd = new FormData();
    fd.append('file', file);
    const r = await fetch('/api/profile/avatar', { method: 'POST', body: fd });
    setUploading(false);
    if (r.ok) {
      const d = await r.json();
      setAvatar(d.url);
      setMsg({ type: 'ok', text: 'อัปเดตรูปโปรไฟล์แล้ว' });
      router.refresh();
    } else {
      const d = await r.json().catch(() => ({}));
      setMsg({ type: 'err', text: d.error || 'อัปโหลดไม่สำเร็จ' });
    }
  };

  const saveProfile = async () => {
    setSaving(true); setMsg(null);
    const r = await fetch('/api/profile', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name, avatar_color: color }),
    });
    setSaving(false);
    if (r.ok) { setMsg({ type: 'ok', text: 'บันทึกโปรไฟล์แล้ว' }); router.refresh(); }
    else setMsg({ type: 'err', text: 'บันทึกไม่สำเร็จ' });
  };

  const savePassword = async () => {
    if (pw.length < 8) return setMsg({ type: 'err', text: 'รหัสผ่านต้องอย่างน้อย 8 ตัว' });
    if (pw !== pw2) return setMsg({ type: 'err', text: 'รหัสผ่านไม่ตรงกัน' });
    setSaving(true); setMsg(null);
    const r = await fetch('/api/profile', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ password: pw }),
    });
    setSaving(false);
    if (r.ok) { setMsg({ type: 'ok', text: 'เปลี่ยนรหัสผ่านแล้ว' }); setPw(''); setPw2(''); }
    else { const d = await r.json().catch(() => ({})); setMsg({ type: 'err', text: d.error || 'เปลี่ยนรหัสผ่านไม่สำเร็จ' }); }
  };

  return (
    <div className="max-w-3xl space-y-5">
      {msg && (
        <div className={`text-sm px-4 py-2.5 rounded-lg ${msg.type === 'ok' ? 'bg-emerald-50 text-emerald-700' : 'bg-rose-50 text-rose-700'}`}>
          {msg.text}
        </div>
      )}

      <Card>
        <CardHeader title="ข้อมูลส่วนตัว" subtitle="ชื่อและรูปแทนตัว" />
        <div className="p-5 flex gap-6">
          <div className="flex flex-col items-center gap-2">
            <div className="relative">
              {avatar ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={avatar} alt="" className="w-20 h-20 rounded-full object-cover" />
              ) : (
                <span className="inline-flex items-center justify-center w-20 h-20 rounded-full text-white text-2xl font-semibold" style={{ background: color }}>
                  {(name || '?').trim().slice(0, 2).toUpperCase()}
                </span>
              )}
              <button
                onClick={() => fileRef.current?.click()}
                disabled={uploading}
                className="absolute -bottom-1 -right-1 w-7 h-7 rounded-full bg-brand-600 text-white flex items-center justify-center shadow hover:bg-brand-700 disabled:opacity-50"
                title="อัปโหลดรูป"
              >
                {uploading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Upload className="w-3.5 h-3.5" />}
              </button>
              <input ref={fileRef} type="file" accept="image/png,image/jpeg,image/webp,image/gif" className="hidden" onChange={uploadAvatar} />
            </div>
            {avatar && <button onClick={() => setAvatar(null)} className="text-[11px] text-slate-400 hover:text-rose-600">ใช้สีแทน</button>}
            {!avatar && (
              <div className="flex gap-1 flex-wrap justify-center max-w-[120px]">
                {SWATCHES.map(s => (
                  <button key={s} onClick={() => setColor(s)} className="w-5 h-5 rounded-full transition" style={{ background: s, boxShadow: color === s ? `0 0 0 2px white, 0 0 0 4px ${s}` : undefined }} aria-label={s} />
                ))}
              </div>
            )}
          </div>
          <div className="flex-1 space-y-3">
            <Field label="ชื่อ"><Input value={name} onChange={e => setName(e.target.value)} /></Field>
            <Field label="อีเมล"><Input value={profile.email} disabled className="bg-slate-50 text-slate-500" /></Field>
            <div className="flex items-center gap-2">
              <span className="text-xs text-slate-500">บทบาท:</span>
              <Badge tone="purple"><ShieldCheck className="w-3 h-3" /> {ROLE_LABELS[profile.role]}</Badge>
            </div>
            <Button onClick={saveProfile} loading={saving} icon={Check}>บันทึก</Button>
          </div>
        </div>
      </Card>

      <Card>
        <CardHeader title="เปลี่ยนรหัสผ่าน" subtitle="อย่างน้อย 8 ตัวอักษร" />
        <div className="p-5 grid grid-cols-2 gap-3">
          <Field label="รหัสผ่านใหม่"><Input type="password" value={pw} onChange={e => setPw(e.target.value)} /></Field>
          <Field label="ยืนยันรหัสผ่าน"><Input type="password" value={pw2} onChange={e => setPw2(e.target.value)} /></Field>
          <div className="col-span-2"><Button variant="outline" onClick={savePassword} loading={saving}>อัปเดตรหัสผ่าน</Button></div>
        </div>
      </Card>

      <Card>
        <CardHeader title="สิทธิ์การเข้าถึงของฉัน" subtitle="กำหนดโดยผู้ดูแลระบบ" />
        <div className="p-5 space-y-4">
          <div>
            <div className="text-xs font-semibold text-slate-500 mb-2">ช่องทางที่เห็นได้</div>
            <div className="flex flex-wrap gap-1.5">
              {scope.isOwner || scope.channels === null
                ? <Badge tone="emerald"><Check className="w-3 h-3" /> ทุกช่องทาง</Badge>
                : scope.channels.length === 0
                  ? <span className="text-xs text-slate-400">ไม่มี</span>
                  : scope.channels.map(c => (
                      <span key={c} className="inline-flex items-center gap-1 text-xs bg-slate-100 rounded-full pl-1 pr-2 py-0.5">
                        <ChannelIcon channel={c} size="xs" /> {CHANNEL_META[c]?.name || c}
                      </span>
                    ))}
            </div>
          </div>
          <div>
            <div className="text-xs font-semibold text-slate-500 mb-2">สิทธิ์การทำงาน</div>
            <div className="flex flex-wrap gap-1.5">
              {permissions.includes('*')
                ? <Badge tone="purple">เข้าถึงได้ทั้งหมด (Owner)</Badge>
                : permissions.map(p => <Badge key={p} tone="brand">{p}</Badge>)}
            </div>
          </div>
        </div>
      </Card>
    </div>
  );
}
