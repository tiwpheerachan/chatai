'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { StatusDot } from '@/components/ui/badge';
import { Avatar } from '@/components/ui/avatar';
import { Modal } from '@/components/ui/modal';
import { Select, Field } from '@/components/ui/input';
import { ChannelIcon } from '@/components/ui/channel-icon';
import { ROLE_LABELS, ROLE_COLORS } from '@/lib/rbac';
import { CHANNEL_META, PLATFORM_CHANNELS } from '@/lib/utils';
import type { Profile, Brand, UserRole, ChannelType } from '@/types/database';
import { SlidersHorizontal, Building2, Globe, Sparkles, UserPlus } from 'lucide-react';

const ROLES: UserRole[] = ['owner', 'admin', 'supervisor', 'agent', 'viewer', 'ai'];
type BrandOpt = Pick<Brand, 'id' | 'name' | 'color'>;
const inputCls = 'w-full text-sm rounded-lg border border-slate-200 px-3 py-2 focus:ring-2 focus:ring-brand-400 focus:border-brand-400';
const toggle = <T,>(arr: T[], v: T, set: (a: T[]) => void) => set(arr.includes(v) ? arr.filter(x => x !== v) : [...arr, v]);

export function TeamClient({
  initialUsers, brands, stats, canManage, isOwner,
}: {
  initialUsers: Profile[];
  brands: BrandOpt[];
  stats: Record<string, { replies: number; conversations: number; last_active: string | null }>;
  canManage: boolean;
  isOwner: boolean;
}) {
  const router = useRouter();
  const [users] = useState(initialUsers);
  const [editing, setEditing] = useState<Profile | null>(null);
  const [creating, setCreating] = useState(false);

  return (
    <>
      <div className="flex justify-end mb-4 gap-2">
        {canManage && <Button icon={UserPlus} onClick={() => setCreating(true)}>สร้างแอดมิน</Button>}
        <Link href="/admin/workload">
          <Button variant="outline" icon={Sparkles}>แบ่งงาน & Performance</Button>
        </Link>
        <Link href="/admin/team/roles">
          <Button variant="outline" icon={SlidersHorizontal}>จัดการสิทธิ์ตาม Role</Button>
        </Link>
      </div>

      <Card className="overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-slate-50 text-slate-500 text-xs uppercase">
            <tr>
              <th className="text-left px-5 py-3 font-medium">พนักงาน</th>
              <th className="text-left px-4 py-3 font-medium">Role</th>
              <th className="text-left px-4 py-3 font-medium">ตอบแชท (7วัน)</th>
              <th className="text-left px-4 py-3 font-medium">แบรนด์ที่เห็น</th>
              <th className="text-left px-4 py-3 font-medium">ช่องทาง</th>
              <th className="text-left px-4 py-3 font-medium">สถานะ</th>
              <th className="px-4 py-3" />
            </tr>
          </thead>
          <tbody>
            {users.map(u => (
              <tr key={u.id} className="border-t border-slate-100 hover:bg-slate-50/60">
                <td className="px-5 py-3">
                  <div className="flex items-center gap-3">
                    <Avatar name={u.name} size="sm" />
                    <div>
                      <div className="font-semibold text-slate-900">{u.name}</div>
                      <div className="text-xs text-slate-400">{u.email}</div>
                    </div>
                  </div>
                </td>
                <td className="px-4 py-3">
                  <span className={`text-xs px-2 py-0.5 rounded-full font-semibold ${ROLE_COLORS[u.role]}`}>{ROLE_LABELS[u.role]}</span>
                </td>
                <td className="px-4 py-3">
                  <span className="font-semibold text-slate-900">{stats[u.id]?.replies ?? 0}</span>
                  <span className="text-xs text-slate-400"> ข้อความ · {stats[u.id]?.conversations ?? 0} เคส</span>
                </td>
                <td className="px-4 py-3">
                  {u.role === 'owner' || (u.allowed_brand_ids ?? null) === null ? (
                    <span className="inline-flex items-center gap-1 text-xs text-slate-500"><Building2 className="w-3 h-3" /> ตาม Role</span>
                  ) : u.allowed_brand_ids!.length === 0 ? (
                    <span className="text-xs text-slate-400">—</span>
                  ) : (
                    <span className="text-xs text-slate-700">{u.allowed_brand_ids!.length} แบรนด์</span>
                  )}
                </td>
                <td className="px-4 py-3">
                  {u.role === 'owner' || (u.allowed_channels ?? null) === null ? (
                    <span className="inline-flex items-center gap-1 text-xs text-slate-500"><Globe className="w-3 h-3" /> ตาม Role</span>
                  ) : (
                    <div className="flex gap-1">
                      {u.allowed_channels!.slice(0, 5).map(c => <ChannelIcon key={c} channel={c} size="xs" />)}
                      {!u.allowed_channels!.length && <span className="text-xs text-slate-400">—</span>}
                    </div>
                  )}
                </td>
                <td className="px-4 py-3">
                  <span className="flex items-center gap-1.5 text-xs capitalize text-slate-600">
                    <StatusDot online={u.status === 'online'} /> {u.status}
                  </span>
                </td>
                <td className="px-4 py-3 text-right whitespace-nowrap">
                  <Link href={`/admin/team/${u.id}`} className="text-xs text-brand-600 hover:underline mr-2">ดูสถิติ</Link>
                  {canManage && <Button size="sm" variant="ghost" onClick={() => setEditing(u)}>แก้ไข</Button>}
                </td>
              </tr>
            ))}
            {!users.length && <tr><td colSpan={7} className="py-10 text-center text-slate-400">ยังไม่มีพนักงาน</td></tr>}
          </tbody>
        </table>
      </Card>

      {creating && (
        <CreateUserModal brands={brands} isOwner={isOwner} onClose={() => setCreating(false)} onSaved={() => { setCreating(false); router.refresh(); }} />
      )}
      {editing && (
        <EditUserModal user={editing} brands={brands} isOwner={isOwner} onClose={() => setEditing(null)} onSaved={() => { setEditing(null); router.refresh(); }} />
      )}
    </>
  );
}

/** Shared brand + channel scope editor. */
function ScopeEditor({ brands, brandMode, setBrandMode, brandIds, setBrandIds, chanMode, setChanMode, channels, setChannels }: {
  brands: BrandOpt[];
  brandMode: 'inherit' | 'custom'; setBrandMode: (m: 'inherit' | 'custom') => void;
  brandIds: string[]; setBrandIds: (a: string[]) => void;
  chanMode: 'inherit' | 'custom'; setChanMode: (m: 'inherit' | 'custom') => void;
  channels: ChannelType[]; setChannels: (a: ChannelType[]) => void;
}) {
  return (
    <>
      <div>
        <div className="flex items-center justify-between mb-1.5">
          <span className="text-xs font-semibold text-slate-700">แบรนด์ที่เข้าถึงได้</span>
          <label className="flex items-center gap-1.5 text-xs text-slate-500 cursor-pointer">
            <input type="checkbox" checked={brandMode === 'inherit'} onChange={e => setBrandMode(e.target.checked ? 'inherit' : 'custom')} />
            ใช้ค่าตาม Role
          </label>
        </div>
        {brandMode === 'custom' && (
          <div className="flex flex-wrap gap-1.5 p-2 rounded-lg border border-slate-200 bg-slate-50">
            {brands.map(b => (
              <button key={b.id} type="button" onClick={() => toggle(brandIds, b.id, setBrandIds)}
                className={`text-xs px-2.5 py-1 rounded-full border transition ${brandIds.includes(b.id) ? 'bg-brand-600 text-white border-brand-600' : 'bg-white border-slate-200 text-slate-600'}`}>
                {b.name}
              </button>
            ))}
            {!brands.length && <span className="text-xs text-slate-400">ยังไม่มีแบรนด์</span>}
          </div>
        )}
      </div>
      <div>
        <div className="flex items-center justify-between mb-1.5">
          <span className="text-xs font-semibold text-slate-700">ช่องทางที่เข้าถึงได้</span>
          <label className="flex items-center gap-1.5 text-xs text-slate-500 cursor-pointer">
            <input type="checkbox" checked={chanMode === 'inherit'} onChange={e => setChanMode(e.target.checked ? 'inherit' : 'custom')} />
            ใช้ค่าตาม Role
          </label>
        </div>
        {chanMode === 'custom' && (
          <div className="grid grid-cols-2 gap-1.5 p-2 rounded-lg border border-slate-200 bg-slate-50">
            {PLATFORM_CHANNELS.map(c => (
              <button key={c} type="button" onClick={() => toggle(channels, c as ChannelType, setChannels)}
                className={`flex items-center gap-2 text-xs px-2 py-1.5 rounded-lg border transition ${channels.includes(c as ChannelType) ? 'bg-white border-brand-400 ring-1 ring-brand-200' : 'bg-white border-slate-200'}`}>
                <ChannelIcon channel={c} size="xs" />
                <span className="text-slate-700">{CHANNEL_META[c]?.name}</span>
              </button>
            ))}
          </div>
        )}
      </div>
    </>
  );
}

function CreateUserModal({ brands, isOwner, onClose, onSaved }: {
  brands: BrandOpt[]; isOwner: boolean; onClose: () => void; onSaved: () => void;
}) {
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [role, setRole] = useState<UserRole>('agent');
  const [brandMode, setBrandMode] = useState<'inherit' | 'custom'>('inherit');
  const [brandIds, setBrandIds] = useState<string[]>([]);
  const [chanMode, setChanMode] = useState<'inherit' | 'custom'>('inherit');
  const [channels, setChannels] = useState<ChannelType[]>([]);
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState('');

  const save = async () => {
    if (!name.trim() || !email.trim() || password.length < 8) { setErr('กรอกชื่อ อีเมล และรหัสผ่าน (อย่างน้อย 8 ตัว) ให้ครบ'); return; }
    setSaving(true); setErr('');
    const r = await fetch('/api/users', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: name.trim(), email: email.trim(), password, role,
        allowed_brand_ids: brandMode === 'inherit' ? null : brandIds,
        allowed_channels: chanMode === 'inherit' ? null : channels,
      }),
    });
    setSaving(false);
    if (r.ok) return onSaved();
    const d = await r.json().catch(() => ({}));
    setErr(d.error || 'สร้างผู้ใช้ไม่สำเร็จ');
  };

  return (
    <Modal open onClose={onClose} title="สร้างแอดมินใหม่"
      footer={<>
        <Button variant="ghost" onClick={onClose}>ยกเลิก</Button>
        <Button onClick={save} loading={saving}>สร้างบัญชี</Button>
      </>}>
      <div className="space-y-4">
        {err && <div className="text-xs text-rose-600 bg-rose-50 p-2 rounded">{err}</div>}
        <Field label="ชื่อที่แสดง"><input className={inputCls} value={name} onChange={e => setName(e.target.value)} placeholder="เช่น แอดมินนุ่น" /></Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="อีเมล (ใช้ล็อกอิน)"><input className={inputCls} type="email" autoComplete="off" value={email} onChange={e => setEmail(e.target.value)} placeholder="name@company.com" /></Field>
          <Field label="รหัสผ่าน (≥ 8 ตัว)"><input className={inputCls} type="text" autoComplete="new-password" value={password} onChange={e => setPassword(e.target.value)} placeholder="ตั้งรหัสผ่าน" /></Field>
        </div>
        <Field label="Role (สิทธิ์)">
          <Select value={role} onChange={e => setRole(e.target.value as UserRole)}>
            {ROLES.filter(r => r !== 'owner' || isOwner).map(r => <option key={r} value={r}>{ROLE_LABELS[r]}</option>)}
          </Select>
        </Field>
        <ScopeEditor brands={brands} brandMode={brandMode} setBrandMode={setBrandMode} brandIds={brandIds} setBrandIds={setBrandIds}
          chanMode={chanMode} setChanMode={setChanMode} channels={channels} setChannels={setChannels} />
        <p className="text-[11px] text-slate-400 flex items-center gap-1"><Sparkles className="w-3 h-3" /> ผู้ใช้ล็อกอินได้ทันทีด้วยอีเมล+รหัสนี้ · แก้ไขสิทธิ์/รหัสภายหลังได้</p>
      </div>
    </Modal>
  );
}

function EditUserModal({ user, brands, isOwner, onClose, onSaved }: {
  user: Profile; brands: BrandOpt[]; isOwner: boolean; onClose: () => void; onSaved: () => void;
}) {
  const [name, setName] = useState(user.name);
  const [email, setEmail] = useState(user.email);
  const [password, setPassword] = useState('');
  const [role, setRole] = useState<UserRole>(user.role);
  const [status, setStatus] = useState(user.status);
  const [brandMode, setBrandMode] = useState<'inherit' | 'custom'>(user.allowed_brand_ids === null ? 'inherit' : 'custom');
  const [brandIds, setBrandIds] = useState<string[]>(user.allowed_brand_ids ?? []);
  const [chanMode, setChanMode] = useState<'inherit' | 'custom'>(user.allowed_channels === null ? 'inherit' : 'custom');
  const [channels, setChannels] = useState<ChannelType[]>(user.allowed_channels ?? []);
  const [autoAssign, setAutoAssign] = useState<boolean>(user.auto_assign ?? true);
  const [maxOpen, setMaxOpen] = useState<string>(user.max_open_chats != null ? String(user.max_open_chats) : '');
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState('');
  const isQueueRole = ['agent', 'supervisor', 'admin'].includes(role);

  const save = async () => {
    if (password && password.length < 8) { setErr('รหัสผ่านต้องมีอย่างน้อย 8 ตัว'); return; }
    setSaving(true); setErr('');
    const body: Record<string, unknown> = {
      role, status,
      allowed_brand_ids: brandMode === 'inherit' ? null : brandIds,
      allowed_channels: chanMode === 'inherit' ? null : channels,
      auto_assign: autoAssign,
      max_open_chats: maxOpen.trim() === '' ? null : Math.max(0, parseInt(maxOpen, 10) || 0),
    };
    if (name.trim() && name.trim() !== user.name) body.name = name.trim();
    if (email.trim() && email.trim() !== user.email) body.email = email.trim();
    if (password) body.password = password;
    const r = await fetch(`/api/users/${user.id}`, {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
    });
    setSaving(false);
    if (r.ok) return onSaved();
    const d = await r.json().catch(() => ({}));
    setErr(d.error || 'บันทึกไม่สำเร็จ');
  };

  return (
    <Modal open onClose={onClose} title={`แก้ไข — ${user.name}`}
      footer={<>
        <Button variant="ghost" onClick={onClose}>ยกเลิก</Button>
        <Button onClick={save} loading={saving}>บันทึก</Button>
      </>}>
      <div className="space-y-4">
        {err && <div className="text-xs text-rose-600 bg-rose-50 p-2 rounded">{err}</div>}

        {/* Login / identity */}
        <div className="rounded-lg border border-slate-200 p-3 space-y-3">
          <div className="text-xs font-semibold text-slate-700">บัญชีเข้าสู่ระบบ</div>
          <Field label="ชื่อที่แสดง"><input className={inputCls} value={name} onChange={e => setName(e.target.value)} /></Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="อีเมล (ใช้ล็อกอิน)"><input className={inputCls} type="email" autoComplete="off" value={email} onChange={e => setEmail(e.target.value)} /></Field>
            <Field label="ตั้งรหัสผ่านใหม่"><input className={inputCls} type="text" autoComplete="new-password" value={password} onChange={e => setPassword(e.target.value)} placeholder="เว้นว่าง = ไม่เปลี่ยน" /></Field>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <Field label="Role">
            <Select value={role} onChange={e => setRole(e.target.value as UserRole)}>
              {ROLES.filter(r => r !== 'owner' || isOwner).map(r => <option key={r} value={r}>{ROLE_LABELS[r]}</option>)}
            </Select>
          </Field>
          <Field label="สถานะ">
            <Select value={status} onChange={e => setStatus(e.target.value)}>
              <option value="online">online</option>
              <option value="offline">offline</option>
              <option value="away">away</option>
              <option value="disabled">disabled (ปิดใช้งาน)</option>
            </Select>
          </Field>
        </div>

        <ScopeEditor brands={brands} brandMode={brandMode} setBrandMode={setBrandMode} brandIds={brandIds} setBrandIds={setBrandIds}
          chanMode={chanMode} setChanMode={setChanMode} channels={channels} setChannels={setChannels} />

        {isQueueRole && (
          <div className="rounded-lg border border-slate-200 bg-slate-50 p-3 space-y-2.5">
            <label className="flex items-center justify-between cursor-pointer">
              <span className="text-xs font-semibold text-slate-700">รับแชทจากการแบ่งงานอัตโนมัติ</span>
              <input type="checkbox" checked={autoAssign} onChange={e => setAutoAssign(e.target.checked)} />
            </label>
            <p className="text-[11px] text-slate-400 -mt-1">ปิดไว้ = คนนี้จะไม่ถูกจ่ายแชทอัตโนมัติ (ยังรับแชทที่มอบหมายเองได้)</p>
            <div className="flex items-center justify-between gap-2">
              <span className="text-xs font-semibold text-slate-700">จำกัดแชทค้างพร้อมกันสูงสุด</span>
              <input type="number" min={0} placeholder="ไม่จำกัด" value={maxOpen} onChange={e => setMaxOpen(e.target.value)}
                className="w-24 text-sm rounded-lg border border-slate-200 px-2 py-1 text-right" />
            </div>
          </div>
        )}

        <p className="text-[11px] text-slate-400 flex items-center gap-1">
          <Sparkles className="w-3 h-3" /> Owner เห็นทุกแบรนด์/ช่องทางเสมอ — การตั้งค่านี้ไม่มีผลกับ Owner
        </p>
      </div>
    </Modal>
  );
}
