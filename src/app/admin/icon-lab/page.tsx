import { Topbar } from '@/components/layout/topbar';
import { Card, CardHeader } from '@/components/ui/card';
import { getCurrentContext } from '@/lib/auth';
import { redirect } from 'next/navigation';
import { Component as WeatherIcons } from '@/components/ui/animated-weather-icons';
import { APP_ANIMATED_ICONS } from '@/components/ui/animated-icons';
import { Folder } from '@/components/ui/folder-components';
import { Logo } from '@/components/ui/logo';

export const dynamic = 'force-dynamic';

const FOLDERS = [
  { color: 'blue' as const, label: 'Knowledge' },
  { color: 'black' as const, label: 'Macros' },
  { color: 'orange' as const, label: 'Shopee' },
  { color: 'grey' as const, label: 'Archive' },
];

export default async function IconLabPage() {
  const ctx = await getCurrentContext();
  if (!ctx) redirect('/login');

  return (
    <>
      <Topbar title="Icon Lab" subtitle="ตัวอย่างไอคอน animated สไตล์ micro-scene" />
      <div className="p-6 space-y-6 overflow-y-auto scroll-thin flex-1">
        <Card>
          <CardHeader title="โลโก้ Sigmachat (เรียบหรู)" subtitle="glass + แสงกวาด + วาดเส้น Σ" />
          <div className="p-8 flex items-center gap-8">
            <Logo size={72} />
            <Logo size={48} />
            <Logo size={32} />
          </div>
        </Card>

        <Card>
          <CardHeader title="โฟลเดอร์ animated (hover ดูเอกสารกาง)" subtitle="ใช้แทนไฟล์/หมวดหมู่ — เอา emoji ออก" />
          <div className="p-8 flex flex-wrap gap-10">
            {FOLDERS.map(f => (
              <Folder key={f.label} color={f.color} size="md" label={f.label} />
            ))}
          </div>
        </Card>

        <Card>
          <CardHeader title="ไอคอนของแอป (framer-motion)" subtitle="สไตล์เดียวกับที่ขอ — เคลื่อนไหวตลอด ไม่ต้อง hover" />
          <div className="p-8 grid grid-cols-3 sm:grid-cols-5 gap-8 justify-items-center">
            {APP_ANIMATED_ICONS.map(({ name, Icon }) => (
              <div key={name} className="flex flex-col items-center gap-3">
                <div className="flex items-center justify-center w-20 h-20 rounded-2xl border border-slate-200 bg-white shadow-card">
                  <Icon size={48} />
                </div>
                <span className="text-[11px] font-medium text-slate-500">{name}</span>
              </div>
            ))}
          </div>
        </Card>

        <Card>
          <CardHeader title="ชุดตัวอย่าง (Weather)" subtitle="คอมโพเนนต์ที่ส่งมา — ไว้ดูเป็นแนวสไตล์" />
          <WeatherIcons />
        </Card>
      </div>
    </>
  );
}
