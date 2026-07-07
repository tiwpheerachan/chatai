import { Topbar } from '@/components/layout/topbar';
import { Card } from '@/components/ui/card';
import { createClient } from '@/lib/supabase/server';
import { notFound } from 'next/navigation';

export default async function CustomerDetail({ params }: { params: { id: string } }) {
  const supabase = createClient();
  const { data: c } = await supabase.from('customers').select('*').eq('id', params.id).maybeSingle();
  if (!c) notFound();
  const { data: convos } = await supabase
    .from('conversations')
    .select('id,channel,status,created_at,last_message_at')
    .eq('customer_id', params.id)
    .order('last_message_at', { ascending: false });

  return (
    <>
      <Topbar title={c.display_name} subtitle="Customer 360°" />
      <div className="p-6 grid grid-cols-3 gap-4 overflow-y-auto scroll-thin flex-1">
        <Card className="p-5">
          <div className="text-center mb-4">
            <div className="w-20 h-20 rounded-full bg-slate-100 flex items-center justify-center text-4xl mx-auto mb-2">{c.avatar}</div>
            <div className="font-bold text-lg">{c.display_name}</div>
            <div className="text-xs text-slate-500">{c.channel}</div>
          </div>
          <dl className="space-y-2 text-sm">
            <div className="flex justify-between"><dt className="text-slate-500">Email</dt><dd>{c.email || '-'}</dd></div>
            <div className="flex justify-between"><dt className="text-slate-500">Phone</dt><dd>{c.phone || '-'}</dd></div>
            <div className="flex justify-between"><dt className="text-slate-500">LTV</dt><dd className="font-semibold">฿{c.ltv.toLocaleString()}</dd></div>
            <div className="flex justify-between"><dt className="text-slate-500">Orders</dt><dd>{c.order_count}</dd></div>
            <div className="flex justify-between"><dt className="text-slate-500">Sentiment</dt><dd>{c.sentiment}</dd></div>
          </dl>
        </Card>
        <Card className="col-span-2 p-5">
          <h3 className="font-semibold mb-3">ประวัติการสนทนา ({convos?.length || 0})</h3>
          <div className="divide-y divide-slate-100">
            {(convos || []).map((co: any) => (
              <div key={co.id} className="py-3 flex justify-between text-sm">
                <div>
                  <div className="font-medium">{co.channel}</div>
                  <div className="text-xs text-slate-500">เริ่มเมื่อ {new Date(co.created_at).toLocaleString('th-TH')}</div>
                </div>
                <span className="text-xs">{co.status}</span>
              </div>
            ))}
          </div>
        </Card>
      </div>
    </>
  );
}
