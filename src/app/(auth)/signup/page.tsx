'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import { Logo } from '@/components/ui/logo';
import Link from 'next/link';

export default function SignupPage() {
  const router = useRouter();
  const supabase = createClient();
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState('');
  const [confirmSent, setConfirmSent] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErr('');
    setLoading(true);
    const { data, error } = await supabase.auth.signUp({
      email,
      password,
      options: { data: { name } },
    });
    setLoading(false);
    if (error) {
      setErr('สมัครไม่สำเร็จ: ' + error.message);
      return;
    }
    // If email confirmation is required, signUp returns no active session.
    // Don't redirect into /admin (middleware would bounce back to /login) —
    // tell the user to confirm via email instead.
    if (!data.session) {
      setConfirmSent(true);
      return;
    }
    router.push('/admin/inbox');
    router.refresh();
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-indigo-100 via-purple-50 to-pink-100 p-4">
      <div className="bg-white rounded-2xl shadow-xl p-8 w-full max-w-md">
        <div className="text-center mb-6 flex flex-col items-center">
          <Logo size={56} />
          <h1 className="font-display text-3xl font-bold mt-3 tracking-tight bg-gradient-to-r from-brand-600 via-violet-600 to-pink-600 bg-clip-text text-transparent">Sigmachat</h1>
          <p className="text-sm text-slate-500">สมัครใช้งาน</p>
        </div>

        {confirmSent ? (
          <div className="text-center space-y-3">
            <div className="text-4xl">📩</div>
            <p className="text-sm text-slate-700">
              สมัครสำเร็จ! เราได้ส่งลิงก์ยืนยันไปที่ <span className="font-semibold">{email}</span><br />
              กรุณากดยืนยันในอีเมลก่อนเข้าสู่ระบบ
            </p>
            <Link href="/login" className="inline-block text-indigo-600 font-semibold text-sm">ไปหน้าเข้าสู่ระบบ</Link>
          </div>
        ) : (
        <form onSubmit={submit} className="space-y-3">
          <div>
            <label className="text-xs font-semibold text-slate-700">ชื่อ</label>
            <input required value={name} onChange={e => setName(e.target.value)} className="w-full mt-1 border border-slate-200 rounded-lg px-3 py-2"/>
          </div>
          <div>
            <label className="text-xs font-semibold text-slate-700">อีเมล</label>
            <input type="email" required value={email} onChange={e => setEmail(e.target.value)} className="w-full mt-1 border border-slate-200 rounded-lg px-3 py-2"/>
          </div>
          <div>
            <label className="text-xs font-semibold text-slate-700">รหัสผ่าน</label>
            <input type="password" required minLength={6} value={password} onChange={e => setPassword(e.target.value)} className="w-full mt-1 border border-slate-200 rounded-lg px-3 py-2"/>
          </div>
          {err && <div className="text-xs text-red-600 bg-red-50 p-2 rounded">{err}</div>}
          <button disabled={loading} className="w-full bg-indigo-600 text-white py-2.5 rounded-lg font-semibold hover:bg-indigo-700 disabled:opacity-50">
            {loading ? 'กำลังสมัคร...' : 'สมัครใช้งาน'}
          </button>
        </form>
        )}

        <p className="text-sm text-center mt-4 text-slate-600">
          มีบัญชีแล้ว? <Link href="/login" className="text-indigo-600 font-semibold">เข้าสู่ระบบ</Link>
        </p>
      </div>
    </div>
  );
}
