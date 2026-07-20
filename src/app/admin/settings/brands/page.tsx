import { Topbar } from '@/components/layout/topbar';
import { Card } from '@/components/ui/card';
import { createClient } from '@/lib/supabase/server';
import type { Brand } from '@/types/database';
import { AddBrandButton } from './add-brand.client';

export default async function BrandsPage() {
  const supabase = createClient();
  const { data: brands } = await supabase.from('brands').select('*').order('created_at', { ascending: false });
  return (
    <>
      <Topbar title="Brands" subtitle="แบรนด์ที่จัดการในระบบ">
        <AddBrandButton />
      </Topbar>
      <div className="p-6 max-w-3xl space-y-3 overflow-y-auto scroll-thin flex-1">
        {(brands as Brand[] || []).map(b => (
          <Card key={b.id} className="p-4 flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg" style={{ background: b.color }} />
            <div className="flex-1">
              <div className="font-semibold">{b.name}</div>
              <div className="text-xs text-slate-500">/{b.slug}</div>
            </div>
            <code className="text-xs text-slate-400">{b.id}</code>
          </Card>
        ))}
      </div>
    </>
  );
}
