/**
 * Seed Supabase Auth users (with profiles auto-created via trigger).
 * SQL data already inserted via sql/003_seed.sql.
 *
 * Usage:  npm run db:seed
 */
import { createClient } from '@supabase/supabase-js';
import 'dotenv/config';

const sb = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
);

const DEMO_USERS = [
  { email: 'owner@omnichat.dev',  password: 'password123', name: 'Owner Demo',    role: 'owner',      avatar: '👩‍💼' },
  { email: 'admin@omnichat.dev',  password: 'password123', name: 'คุณสมหญิง',     role: 'admin',      avatar: '👩‍💼' },
  { email: 'sup@omnichat.dev',    password: 'password123', name: 'คุณนภัสสร',     role: 'supervisor', avatar: '👩' },
  { email: 'agent1@omnichat.dev', password: 'password123', name: 'คุณธนภัทร',     role: 'agent',      avatar: '🧑' },
  { email: 'agent2@omnichat.dev', password: 'password123', name: 'คุณวริศรา',     role: 'agent',      avatar: '👧' },
];

async function main() {
  console.log('🌱 Seeding demo users...');
  for (const u of DEMO_USERS) {
    const { data, error } = await sb.auth.admin.createUser({
      email: u.email,
      password: u.password,
      email_confirm: true,
      user_metadata: { name: u.name },
    });
    if (error && !error.message.includes('already')) {
      console.warn(`  ✗ ${u.email}:`, error.message);
      continue;
    }
    if (data?.user) {
      await sb.from('profiles').upsert({
        id: data.user.id,
        email: u.email,
        name: u.name,
        role: u.role,
        avatar: u.avatar,
      });
      console.log(`  ✓ ${u.email}`);
    }
  }

  console.log('\n📧 Demo login:');
  for (const u of DEMO_USERS) console.log(`   ${u.email} / ${u.password}  (${u.role})`);
  console.log('\n✅ Seed complete!');
}

main().catch(e => { console.error(e); process.exit(1); });
