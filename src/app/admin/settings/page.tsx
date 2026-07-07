import { Topbar } from '@/components/layout/topbar';
import { Card } from '@/components/ui/card';
import Link from 'next/link';
import { Building2, Clock, Bell, Webhook } from 'lucide-react';

const SECTIONS = [
  { href: '/admin/settings/brands', label: 'แบรนด์', desc: 'จัดการแบรนด์หลายแบรนด์ (multi-tenant)', icon: Building2 },
  { href: '/admin/settings/sla',    label: 'SLA',    desc: 'กฎเวลาตอบ + escalation',           icon: Clock },
  { href: '/admin/settings/alerts', label: 'Alerts', desc: 'แจ้งเตือนเมื่อมีปัญหา',                 icon: Bell },
  { href: '/admin/channels',        label: 'Webhooks', desc: 'URL สำหรับเชื่อมต่อแต่ละ platform',  icon: Webhook },
];

export default function SettingsPage() {
  return (
    <>
      <Topbar title="Settings" subtitle="ตั้งค่าระบบ" />
      <div className="p-6 max-w-4xl grid grid-cols-2 gap-4 overflow-y-auto scroll-thin flex-1">
        {SECTIONS.map(s => (
          <Link key={s.href} href={s.href}>
            <Card className="p-5 hover:border-indigo-300 hover:shadow-sm transition-all cursor-pointer">
              <div className="flex items-start gap-3">
                <div className="w-10 h-10 rounded-lg bg-indigo-50 text-indigo-600 flex items-center justify-center">
                  <s.icon className="w-5 h-5" />
                </div>
                <div>
                  <div className="font-semibold">{s.label}</div>
                  <div className="text-xs text-slate-500 mt-0.5">{s.desc}</div>
                </div>
              </div>
            </Card>
          </Link>
        ))}
      </div>
    </>
  );
}
