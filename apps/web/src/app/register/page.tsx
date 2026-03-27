'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { PasswordStrengthIndicator } from '@/components/ui/PasswordStrengthIndicator';

export default function RegisterPage() {
  const router = useRouter();
  const [form, setForm] = useState({ fullName: '', email: '', password: '', role: 'NURSE', clinicId: '' });
  const [errors, setErrors] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);

  const set = (k: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) =>
    setForm((f) => ({ ...f, [k]: e.target.value }));

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrors([]);
    setLoading(true);
    try {
      const res = await fetch('/api/v1/auth/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(form),
      });
      const data = await res.json();
      if (!res.ok) {
        setErrors(Array.isArray(data.errors) ? data.errors : [data.message ?? 'Registration failed']);
        return;
      }
      router.push('/login');
    } catch {
      setErrors(['An error occurred. Please try again.']);
    } finally {
      setLoading(false);
    }
  };

  const inputCls = 'w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500';

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50 py-12 px-4">
      <div className="w-full max-w-md space-y-6">
        <h1 className="text-3xl font-bold text-gray-900 text-center">Create account</h1>

        <form onSubmit={handleSubmit} className="space-y-4 bg-white p-8 rounded-lg shadow">
          {errors.length > 0 && (
            <ul className="rounded-md bg-red-50 p-4 space-y-1" role="alert">
              {errors.map((e) => <li key={e} className="text-sm text-red-700">{e}</li>)}
            </ul>
          )}

          <div>
            <label htmlFor="fullName" className="block text-sm font-medium text-gray-700 mb-1">Full name</label>
            <input id="fullName" type="text" required className={inputCls} value={form.fullName} onChange={set('fullName')} />
          </div>

          <div>
            <label htmlFor="email" className="block text-sm font-medium text-gray-700 mb-1">Email</label>
            <input id="email" type="email" required className={inputCls} value={form.email} onChange={set('email')} autoComplete="email" />
          </div>

          <div>
            <label htmlFor="password" className="block text-sm font-medium text-gray-700 mb-1">Password</label>
            <input id="password" type="password" required className={inputCls} value={form.password} onChange={set('password')} autoComplete="new-password" />
            <PasswordStrengthIndicator password={form.password} />
          </div>

          <div>
            <label htmlFor="role" className="block text-sm font-medium text-gray-700 mb-1">Role</label>
            <select id="role" className={inputCls} value={form.role} onChange={set('role')}>
              {['CLINIC_ADMIN','DOCTOR','NURSE','ASSISTANT','READ_ONLY'].map((r) => (
                <option key={r} value={r}>{r}</option>
              ))}
            </select>
          </div>

          <div>
            <label htmlFor="clinicId" className="block text-sm font-medium text-gray-700 mb-1">Clinic ID</label>
            <input id="clinicId" type="text" required className={inputCls} value={form.clinicId} onChange={set('clinicId')} />
          </div>

          <button
            type="submit"
            disabled={loading}
            className="w-full py-2 px-4 rounded-md bg-blue-600 text-white text-sm font-medium hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {loading ? 'Creating account…' : 'Create account'}
          </button>
        </form>
      </div>
    </div>
  );
}
