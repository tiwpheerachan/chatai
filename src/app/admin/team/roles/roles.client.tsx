'use client';

import { useEffect, useState } from 'react';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Avatar } from '@/components/ui/avatar';
import { ChannelIcon } from '@/components/ui/channel-icon';
import { ROLE_LABELS, ROLE_COLORS } from '@/lib/rbac';
import { PERMISSION_CATALOG, matchPermission, type RolePermission } from '@/lib/permissions';
import { CHANNEL_META, PLATFORM_CHANNELS } from '@/lib/utils';
import type { Brand, UserRole } from '@/types/database';
import { Check, Lock, Save, Loader2 } from 'lucide-react';

export function RolesClient({
  brands, canManage,
}: {
  brands: Pick<Brand, 'id' | 'name' | 'color'>[];
  canManage: boolean;
}) {
  const [roles, setRoles] = useState<RolePermission[] | null>(null);
  const [active, setActive] = useState<UserRole>('admin');
  const [draft, setDraft] = useState<RolePermission | null>(null);
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState('');

  useEffect(() => {
    fetch('/api/permissions/roles').then(r => r.json()).then((rows: RolePermission[]) => {
      setRoles(rows);
      const a = rows.find(r => r.role === 'admin') || rows[0];
      if (a) { setActive(a.role); setDraft(structuredClone(a)); }
    }).catch(() => {});
  }, []);

  const selectRole = (role: UserRole) => {
    const r = roles?.find(x => x.role === role);
    if (r) { setActive(role); setDraft(structuredClone(r)); setMsg(''); }
  };

  if (!roles || !draft) {
    return <div className="flex items-center gap-2 text-slate-400 text-sm"><Loader2 className="w-4 h-4 animate-spin" /> กำลังโหลด...</div>;
  }

  const locked = draft.role === 'owner';
  const editable = canManage && !locked;

  const togglePerm = (key: string) => {
    if (!editable) return;
    const has = draft.permissions.includes(key);
    setDraft({ ...draft, permissions: has ? draft.permissions.filter(p => p !== key) : [...draft.permissions, key] });
  };
  const toggleBrand = (id: string) => {
    if (!editable) return;
    const cur = draft.brand_scope;
    if (cur === null) return setDraft({ ...draft, brand_scope: brands.map(b => b.id).filter(x => x !== id) });
    setDraft({ ...draft, brand_scope: cur.includes(id) ? cur.filter(x => x !== id) : [...cur, id] });
  };
  const toggleChannel = (c: string) => {
    if (!editable) return;
    const cur = draft.channel_scope;
    if (cur === null) return setDraft({ ...draft, channel_scope: PLATFORM_CHANNELS.filter(x => x !== c) as string[] });
    setDraft({ ...draft, channel_scope: cur.includes(c) ? cur.filter(x => x !== c) : [...cur, c] });
  };

  const save = async () => {
    setSaving(true); setMsg('');
    const r = await fetch(`/api/permissions/roles?role=${draft.role}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ permissions: draft.permissions, brand_scope: draft.brand_scope, channel_scope: draft.channel_scope }),
    });
    setSaving(false);
    if (r.ok) {
      setRoles(roles.map(x => x.role === draft.role ? draft : x));
      setMsg('บันทึกแล้ว');
    } else {
      const d = await r.json().catch(() => ({}));
      setMsg(d.error || 'บันทึกไม่สำเร็จ');
    }
  };

  return (
    <div className="flex gap-5">
      {/* Role list */}
      <Card className="w-52 p-2 h-fit shrink-0">
        {roles.map(r => (
          <button key={r.role} onClick={() => selectRole(r.role)}
            className={`w-full flex items-center gap-2 px-3 py-2 rounded-lg text-sm mb-0.5 transition ${active === r.role ? 'bg-brand-50 text-brand-700 font-semibold' : 'text-slate-600 hover:bg-slate-50'}`}>
            <span className={`text-xs px-2 py-0.5 rounded-full ${ROLE_COLORS[r.role]}`}>{ROLE_LABELS[r.role]}</span>
            {r.role === 'owner' && <Lock className="w-3 h-3 text-slate-400 ml-auto" />}
          </button>
        ))}
      </Card>

      {/* Editor */}
      <div className="flex-1 space-y-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Avatar name={ROLE_LABELS[draft.role]} size="sm" />
            <div>
              <div className="font-semibold text-slate-900">{ROLE_LABELS[draft.role]}</div>
              <div className="text-xs text-slate-400">{locked ? 'เข้าถึงได้ทั้งหมด — แก้ไขไม่ได้' : 'กำหนดสิทธิ์การทำงานและขอบเขตข้อมูล'}</div>
            </div>
          </div>
          {editable && (
            <div className="flex items-center gap-3">
              {msg && <span className="text-xs text-emerald-600">{msg}</span>}
              <Button onClick={save} loading={saving} icon={Save}>บันทึก</Button>
            </div>
          )}
        </div>

        {/* Permissions */}
        <Card className="p-5">
          <h3 className="font-semibold text-slate-900 mb-3">สิทธิ์การทำงาน</h3>
          <div className="grid grid-cols-2 gap-x-6 gap-y-4">
            {PERMISSION_CATALOG.map(group => (
              <div key={group.group}>
                <div className="text-xs font-semibold text-slate-500 mb-1.5">{group.group}</div>
                <div className="space-y-1">
                  {group.items.map(item => {
                    const granted = matchPermission(draft.permissions, item.key);
                    const explicit = draft.permissions.includes(item.key);
                    return (
                      <label key={item.key} className={`flex items-center gap-2 text-sm ${editable ? 'cursor-pointer' : 'cursor-default'}`}>
                        <button type="button" onClick={() => togglePerm(item.key)} disabled={!editable}
                          className={`w-4 h-4 rounded flex items-center justify-center border transition ${granted ? 'bg-brand-600 border-brand-600' : 'border-slate-300 bg-white'} ${!editable && 'opacity-60'}`}>
                          {granted && <Check className="w-3 h-3 text-white" />}
                        </button>
                        <span className={granted ? 'text-slate-800' : 'text-slate-500'}>{item.label}</span>
                        {granted && !explicit && <span className="text-[10px] text-slate-400">(wildcard)</span>}
                      </label>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>
        </Card>

        {/* Brand scope */}
        <Card className="p-5">
          <div className="flex items-center justify-between mb-3">
            <h3 className="font-semibold text-slate-900">แบรนด์ที่เห็นได้</h3>
            <label className="flex items-center gap-1.5 text-xs text-slate-500">
              <input type="checkbox" disabled={!editable} checked={draft.brand_scope === null}
                onChange={e => setDraft({ ...draft, brand_scope: e.target.checked ? null : brands.map(b => b.id) })} />
              ทุกแบรนด์
            </label>
          </div>
          {draft.brand_scope === null ? (
            <p className="text-sm text-slate-400">เห็นได้ทุกแบรนด์</p>
          ) : (
            <div className="flex flex-wrap gap-1.5">
              {brands.map(b => (
                <button key={b.id} type="button" onClick={() => toggleBrand(b.id)} disabled={!editable}
                  className={`text-xs px-2.5 py-1 rounded-full border transition ${draft.brand_scope!.includes(b.id) ? 'bg-brand-600 text-white border-brand-600' : 'bg-white border-slate-200 text-slate-600'}`}>
                  {b.name}
                </button>
              ))}
              {!brands.length && <span className="text-xs text-slate-400">ยังไม่มีแบรนด์</span>}
            </div>
          )}
        </Card>

        {/* Channel scope */}
        <Card className="p-5">
          <div className="flex items-center justify-between mb-3">
            <h3 className="font-semibold text-slate-900">ช่องทางที่เห็นได้</h3>
            <label className="flex items-center gap-1.5 text-xs text-slate-500">
              <input type="checkbox" disabled={!editable} checked={draft.channel_scope === null}
                onChange={e => setDraft({ ...draft, channel_scope: e.target.checked ? null : [...PLATFORM_CHANNELS] as string[] })} />
              ทุกช่องทาง
            </label>
          </div>
          {draft.channel_scope === null ? (
            <p className="text-sm text-slate-400">เห็นได้ทุกช่องทาง</p>
          ) : (
            <div className="grid grid-cols-4 gap-1.5">
              {PLATFORM_CHANNELS.map(c => (
                <button key={c} type="button" onClick={() => toggleChannel(c)} disabled={!editable}
                  className={`flex items-center gap-2 text-xs px-2 py-1.5 rounded-lg border transition ${draft.channel_scope!.includes(c) ? 'bg-white border-brand-400 ring-1 ring-brand-200' : 'bg-white border-slate-200'}`}>
                  <ChannelIcon channel={c} size="xs" />
                  <span className="text-slate-700 truncate">{CHANNEL_META[c]?.name}</span>
                </button>
              ))}
            </div>
          )}
        </Card>
      </div>
    </div>
  );
}
