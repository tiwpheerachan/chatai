# Sigmachat — Next.js 14 + Supabase + Render

ศูนย์รวมแชททุกแพลตฟอร์ม (LINE, FB, IG, Shopee, TikTok, Lazada, WhatsApp, Web) พร้อม AI bot — Next.js 14 App Router + TypeScript + Supabase + Tailwind

## 🚀 Quick start

```bash
# 1. Clone & install
npm install
cp .env.example .env.local

# 2. ตั้ง Supabase project ที่ supabase.com
#    คัดลอก URL + anon key + service-role key ใส่ .env.local

# 3. รัน SQL schema ใน Supabase SQL Editor (เรียงตามลำดับ)
#    sql/001_schema.sql
#    sql/002_rls_policies.sql
#    sql/003_seed.sql

# 4. เปิด pgvector extension ใน Supabase: Database → Extensions → vector

# 5. Seed demo users
npm run db:seed

# 6. Dev server
npm run dev
# → http://localhost:3000
```

**Demo login:** `owner@omnichat.dev` / `password123`

## 📁 โครงสร้าง (Next.js App Router)

```
omnichat-next/
├── sql/                        ← Supabase schema + RLS + seed
│   ├── 001_schema.sql
│   ├── 002_rls_policies.sql
│   └── 003_seed.sql
├── scripts/
│   ├── seed.ts                 ← สร้าง auth users
│   └── test-webhook.sh
├── docs/
│   ├── ARCHITECTURE.md
│   ├── WEBHOOKS.md
│   └── RBAC.md
├── public/
├── src/
│   ├── middleware.ts           ← Auth gate
│   ├── types/database.ts       ← TypeScript types
│   ├── lib/
│   │   ├── supabase/
│   │   │   ├── client.ts       (browser)
│   │   │   ├── server.ts       (server components)
│   │   │   └── admin.ts        (service role — bypass RLS)
│   │   ├── auth.ts (Supabase Auth integration)
│   │   ├── rbac.ts             ← Permission matrix
│   │   ├── rag.ts              ← Embedding + pgvector retrieval
│   │   ├── bot.ts              ← AI reply generator
│   │   ├── channels/index.ts   ← Outbound sender per platform
│   │   ├── conversations.ts    ← Service layer
│   │   └── ingest.ts           ← Inbound message processor
│   ├── components/
│   │   ├── ui/                 (card, stat, button, icon)
│   │   ├── layout/             (sidebar, topbar)
│   │   └── inbox/              (conversation-list, chat-thread)
│   └── app/
│       ├── layout.tsx
│       ├── page.tsx            (→ /admin/inbox)
│       ├── globals.css
│       ├── (auth)/
│       │   ├── login/page.tsx
│       │   └── signup/page.tsx
│       ├── admin/
│       │   ├── layout.tsx       (with sidebar)
│       │   ├── dashboard/
│       │   │   ├── page.tsx
│       │   │   └── charts.client.tsx
│       │   ├── inbox/
│       │   │   ├── page.tsx
│       │   │   ├── inbox.client.tsx
│       │   │   └── [id]/page.tsx
│       │   ├── customers/
│       │   │   ├── page.tsx
│       │   │   └── [id]/page.tsx
│       │   ├── knowledge-base/
│       │   │   ├── page.tsx
│       │   │   └── new/page.tsx
│       │   ├── ai-bot/
│       │   │   ├── page.tsx
│       │   │   ├── test-panel.client.tsx
│       │   │   └── rules/page.tsx
│       │   ├── macros/page.tsx
│       │   ├── analytics/
│       │   │   ├── page.tsx
│       │   │   └── charts.client.tsx
│       │   ├── team/
│       │   │   ├── page.tsx
│       │   │   └── roles/page.tsx
│       │   ├── channels/
│       │   │   ├── page.tsx
│       │   │   └── [type]/page.tsx
│       │   ├── settings/
│       │   │   ├── page.tsx
│       │   │   └── brands/page.tsx
│       │   └── audit-log/page.tsx
│       └── api/
│           ├── health/route.ts
│           ├── auth/{me,logout}/route.ts
│           ├── conversations/
│           │   ├── route.ts
│           │   └── [id]/{route, messages, ai-reply, send-ai, transfer, close}/route.ts
│           ├── customers/route.ts
│           ├── kb/{route, retrieve}/route.ts
│           ├── macros/route.ts
│           ├── bot/{test, rules}/route.ts
│           ├── users/route.ts
│           ├── brands/route.ts
│           ├── channels/route.ts
│           ├── analytics/{overview, timeseries, channels, topics}/route.ts
│           └── webhooks/
│               ├── line/route.ts
│               ├── meta/route.ts          (Facebook + Instagram)
│               ├── whatsapp/route.ts
│               ├── shopee/route.ts
│               ├── tiktok/route.ts
│               ├── web/route.ts
│               └── ingest/route.ts        (generic for testing)
├── package.json
├── tsconfig.json
├── next.config.js
├── tailwind.config.ts
├── postcss.config.js
├── render.yaml                 ← Render deploy
└── .env.example
```

## 🧪 ทดสอบ webhook ทันที (ไม่ต้องเชื่อม platform จริง)

```bash
URL=http://localhost:3000 bash scripts/test-webhook.sh
```

แชทจะเด้งขึ้น Inbox แบบ realtime + AI ตอบอัตโนมัติ

## 🚢 Deploy บน Render

1. Push โปรเจกต์ขึ้น GitHub
2. ไป Render → New → Web Service → เชื่อม repo
3. Render จะอ่าน `render.yaml` อัตโนมัติ
4. ตั้ง env vars (Supabase + LLM keys + Platform webhooks)
5. Deploy

หลัง deploy เสร็จ:
- เอา URL ที่ Render ให้ ไปใส่ใน LINE/FB/Shopee/TikTok developer console
- Webhook URLs: `https://your-app.onrender.com/api/webhooks/{line|meta|whatsapp|shopee|tiktok|web}`

## ✨ ฟีเจอร์

- **Unified Inbox** — ทุกแชท ทุก platform กล่องเดียว
- **AI Agent (Aria)** — RAG จาก KB + Pattern + LLM (OpenAI/Claude)
- **Realtime** — Supabase Realtime subscriptions
- **CRM 360°** — ลูกค้า + LTV + ออเดอร์ + sentiment
- **RBAC 5 roles** — Owner / Admin / Supervisor / Agent / Viewer
- **RLS policies** — Postgres-level multi-tenant security
- **Knowledge Base + pgvector** — RAG search
- **Bot Builder** — pattern + intent + auto-handoff
- **Macros** — quick replies พร้อม `{{ตัวแปร}}`
- **Analytics** — topic clustering, sentiment, channel mix
- **Multi-brand** — แยกข้อมูล/สิทธิ์ต่อแบรนด์
- **Audit Log** — บันทึกทุก action
- **Webhook hardening** — HMAC verification (LINE), verify_token (Meta)

## 📜 License

MIT
# chatai
