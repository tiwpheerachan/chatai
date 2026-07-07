# Webhook Setup

ทุก platform ต้องตั้ง webhook URL ในตัว developer console ของแต่ละเจ้า

## LINE Messaging API

1. ไป https://developers.line.biz/console/ → สร้าง provider + channel
2. คัดลอก **Channel access token** + **Channel secret** ใส่ `.env`
3. Webhook URL: `https://YOUR_DOMAIN/api/webhooks/line`
4. เปิด "Use webhook" + ปิด auto-reply messages

## Facebook Messenger + Instagram DM

1. ไป https://developers.facebook.com/apps → สร้าง app type "Business"
2. เพิ่ม **Messenger** product → ผูก page
3. ตั้ง webhook URL: `https://YOUR_DOMAIN/api/webhooks/meta`
4. Verify token = `META_VERIFY_TOKEN` ใน `.env` (ตั้งเป็น string อะไรก็ได้)
5. Subscribe events: `messages`, `messaging_postbacks`
6. คัดลอก **Page Access Token** ใส่ `META_PAGE_ACCESS_TOKEN`

## WhatsApp Cloud API

1. ใน Facebook app เดิม → เพิ่ม **WhatsApp** product
2. คัดลอก **Phone number ID** + **Access token**
3. Webhook URL: `https://YOUR_DOMAIN/api/webhooks/whatsapp`

## Shopee Open Platform

1. https://open.shopee.com/ → สร้าง partner app
2. Push URL: `https://YOUR_DOMAIN/api/webhooks/shopee`
3. คัดลอก **Partner ID**, **Partner Key**, **Shop ID** ใส่ `.env`

## TikTok Shop

1. https://partners.tiktokshop.com/ → สมัคร developer
2. Webhook URL: `https://YOUR_DOMAIN/api/webhooks/tiktok`

## Web Widget

Embed บนเว็บไซต์:
```html
<script>
  window.SigmachatConfig = {
    apiUrl: 'https://YOUR_DOMAIN/api/webhooks/web',
    brandId: 'your-brand-uuid',
  };
</script>
<script src="https://YOUR_DOMAIN/widget.js"></script>
```

## ทดสอบโดยไม่เชื่อม platform จริง

```bash
URL=http://localhost:3000 bash scripts/test-webhook.sh
```

หรือ:
```bash
curl -X POST http://localhost:3000/api/webhooks/ingest \
  -H "Content-Type: application/json" \
  -d '{"channel":"line","channel_user_id":"U1","display_name":"ลูกค้า","text":"ขอคืนเงิน"}'
```
