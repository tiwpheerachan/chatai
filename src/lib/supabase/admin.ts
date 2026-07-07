import { createClient } from '@supabase/supabase-js';

/**
 * Admin (service-role) client.
 * ใช้สำหรับ webhook / cron / migration ที่ต้องข้าม RLS
 * ห้าม import ในไฟล์ client-side หรือ public component
 */
export function createAdminClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } },
  );
}
