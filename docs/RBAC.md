# Role-Based Access Control

## ระดับสิทธิ์ (5 roles + AI)

| Role | คำอธิบาย |
|---|---|
| `owner` | เจ้าของระบบ — สิทธิ์เต็ม รวม billing |
| `admin` | จัดการทุกอย่างยกเว้น billing |
| `supervisor` | จัดการแชท + train AI + view reports ของทีม |
| `agent` | ตอบแชทเท่านั้น (เฉพาะที่ assign) |
| `viewer` | ดูได้ ไม่แก้ |
| `ai` | special role สำหรับ AI agent (Aria) |

## Permission matrix (`src/lib/rbac.ts`)

| Action | owner | admin | supervisor | agent | viewer |
|---|:-:|:-:|:-:|:-:|:-:|
| `chat.reply` | ✓ | ✓ | ✓ | ✓ | — |
| `chat.transfer` | ✓ | ✓ | ✓ | ✓ | — |
| `chat.read` | ✓ | ✓ | ✓ | own | ✓ |
| `macro.*` | ✓ | ✓ | ✓ | — | — |
| `kb.*` | ✓ | ✓ | ✓ | — | — |
| `team.*` | ✓ | ✓ | — | — | — |
| `channel.*` | ✓ | ✓ | — | — | — |
| `analytics.*` | ✓ | ✓ | ✓ | own | read |
| `order.refund` | ✓ | ✓ | จำกัด | — | — |
| `billing` | ✓ | — | — | — | — |

## ใช้งานในโค้ด

```ts
import { can } from '@/lib/rbac';

if (!can(user.role, 'macro.delete')) {
  return new Response('Forbidden', { status: 403 });
}
```

## RLS (Row Level Security)

นอกจาก app-level check แล้ว Postgres RLS บังคับซ้ำที่ DB layer — แม้จะมีคนเจาะระบบหรือใช้ Postgres client ตรงๆ ก็เห็นได้แค่ข้อมูลในขอบเขตของ brand ตัวเอง

ตัวอย่าง policy ใน `sql/002_rls_policies.sql`:

```sql
create policy conv_brand_read on conversations for select
  using (
    current_user_brand() is null
    or brand_id = current_user_brand()
    or current_user_role() in ('owner','admin')
  );
```

`current_user_brand()` และ `current_user_role()` เป็น helper functions ที่อ่านจาก `profiles` table โดยใช้ `auth.uid()` ของ Supabase Auth
