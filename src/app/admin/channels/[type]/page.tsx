import { Topbar } from '@/components/layout/topbar';
import { Card } from '@/components/ui/card';
import { CHANNEL_META } from '@/lib/utils';
import { notFound } from 'next/navigation';

const SETUP_DOCS: Record<string, { url: string; envVars: string[] }> = {
  line:      { url: 'https://developers.line.biz/console/',           envVars: ['LINE_CHANNEL_ACCESS_TOKEN', 'LINE_CHANNEL_SECRET'] },
  facebook:  { url: 'https://developers.facebook.com/apps',           envVars: ['META_VERIFY_TOKEN', 'META_PAGE_ACCESS_TOKEN', 'META_APP_SECRET'] },
  instagram: { url: 'https://developers.facebook.com/apps',           envVars: ['META_VERIFY_TOKEN', 'META_PAGE_ACCESS_TOKEN'] },
  whatsapp:  { url: 'https://developers.facebook.com/docs/whatsapp',  envVars: ['WHATSAPP_PHONE_NUMBER_ID', 'WHATSAPP_ACCESS_TOKEN'] },
  shopee:    { url: 'https://open.shopee.com/',                       envVars: ['SHOPEE_PARTNER_ID', 'SHOPEE_PARTNER_KEY', 'SHOPEE_SHOP_ID'] },
  tiktok:    { url: 'https://partners.tiktokshop.com/',               envVars: ['TIKTOK_APP_KEY', 'TIKTOK_APP_SECRET'] },
  lazada:    { url: 'https://open.lazada.com/',                       envVars: ['LAZADA_APP_KEY', 'LAZADA_APP_SECRET'] },
  web:       { url: '',                                                envVars: [] },
};

export default function ChannelDetail({ params }: { params: { type: string } }) {
  const meta = CHANNEL_META[params.type];
  if (!meta) notFound();
  const doc = SETUP_DOCS[params.type];

  return (
    <>
      <Topbar title={meta.name} subtitle="ตั้งค่า + Webhook URL" />
      <div className="p-6 max-w-3xl space-y-4 overflow-y-auto scroll-thin flex-1">
        <Card className="p-5">
          <h3 className="font-semibold mb-3">Webhook URL</h3>
          <p className="text-xs text-slate-500 mb-2">เอา URL นี้ไปใส่ใน developer console</p>
          <code className="block bg-slate-100 p-3 rounded text-sm font-mono break-all">
            {process.env.NEXT_PUBLIC_APP_URL || 'https://your-app.onrender.com'}/api/webhooks/{params.type === 'facebook' || params.type === 'instagram' ? 'meta' : params.type}
          </code>
        </Card>

        <Card className="p-5">
          <h3 className="font-semibold mb-3">Environment Variables ที่ต้องตั้ง</h3>
          <div className="space-y-1">
            {doc?.envVars.map(v => (
              <code key={v} className="block bg-slate-50 p-2 rounded text-xs font-mono">{v}=...</code>
            ))}
          </div>
          {doc?.url && (
            <a href={doc.url} target="_blank" rel="noopener noreferrer" className="mt-3 inline-block text-xs text-indigo-600 hover:underline">
              ไปที่ Developer Console →
            </a>
          )}
        </Card>
      </div>
    </>
  );
}
