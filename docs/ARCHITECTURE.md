# Architecture

```
┌─ INBOUND ─────────────────────────────────────────────┐
│ LINE  FB  IG  Shopee  TikTok  WhatsApp  Lazada  Web   │
└─────────────────┬─────────────────────────────────────┘
                  │
        /api/webhooks/{type}/route.ts
                  │
                  ▼
          lib/ingest.ts
            (normalize)
                  │
                  ├──► upsertCustomer()
                  ├──► getOrCreateConversation()
                  ├──► addMessage(sender_type='customer')
                  │
                  ├──► IF ai_handling:
                  │     bot.generateReply()
                  │      ├─ check bot_rules (regex)
                  │      ├─ rag.retrieve() — pgvector or keyword
                  │      └─ LLM call (OpenAI / Claude)
                  │     addMessage(sender_type='ai')
                  │     channels.sendTo()  →  outbound
                  │
                  └──► Supabase Realtime broadcasts to all connected dashboards
                            │
                            ▼
                ┌────── DASHBOARD ──────┐
                │ React (App Router)    │
                │ Supabase Auth + RLS   │
                │ Realtime updates      │
                └────────────────────────┘
```

## ทำไม Next.js App Router?

- **Server components**: query Supabase ฝั่ง server ลด JS bundle
- **Streaming**: หน้าโหลดเร็ว
- **API routes**: webhook + REST อยู่ในโปรเจกต์เดียว
- **Middleware**: auth gate ก่อน render
- **โครงสร้างชัด**: แต่ละ feature เป็น folder ของตัวเอง (page.tsx + components)

## ทำไม Supabase?

- **Postgres** เต็มรูปแบบ (เปลี่ยนไป self-host ได้)
- **Auth** built-in (email/password, OAuth, magic link)
- **Realtime** subscriptions ผ่าน WebSocket
- **RLS** กำหนดสิทธิ์ระดับ row (multi-tenant)
- **pgvector** สำหรับ RAG (ไม่ต้องตั้ง Pinecone/Qdrant แยก)
- **Storage** สำหรับ attachment
- **Edge functions** สำหรับ background jobs

## RAG flow

1. ลูกค้าส่งข้อความ → `ingest()`
2. `bot.generateReply()` เรียก `rag.retrieve(query)`
3. `rag.embed(query)` → OpenAI text-embedding-3-small (1536 dims)
4. Supabase RPC `match_kb(query_embedding, k)` ใช้ pgvector cosine similarity
5. Top-K docs ถูกใส่ใน LLM system prompt
6. LLM ตอบ → return text + sources + confidence
7. ถ้า confidence < 0.5 → ตั้ง `ai_handling = false`, `priority = high`

## Realtime sync

Frontend subscribe Postgres changes:
```ts
supabase
  .channel('messages-realtime')
  .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'messages' }, (payload) => {
    // refetch conversation list + active conversation
  })
  .subscribe();
```

Trigger ใน DB (`update_last_message_at`) อัปเดต `conversations.last_message_at` + `unread` อัตโนมัติเมื่อ message ใหม่เข้ามา

## Scaling considerations

| ที่ | จุดเริ่ม | เมื่อโตขึ้น |
|---|---|---|
| **DB** | Supabase Free (500MB) | Supabase Pro / dedicated Postgres |
| **Vector** | pgvector (in Supabase) | Qdrant cluster เมื่อ >100k docs |
| **Realtime** | Supabase Realtime | self-host Soketi |
| **LLM** | gpt-4o-mini ($0.15/M tok) | คาช + batch + fine-tune |
| **Webhook** | direct ingest | queue ผ่าน Redis/BullMQ |
| **Logs** | Supabase logs | Datadog / Logflare |
