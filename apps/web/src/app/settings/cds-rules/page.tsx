import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import CDSRulesClient from './CDSRulesClient';

export default async function CDSRulesPage() {
  const session = await getServerSession(authOptions);
  const role = (session?.user as { role?: string } | undefined)?.role;
  const canCreate = role === 'admin' || role === 'medical_director';

  return <CDSRulesClient canCreate={canCreate} role={role ?? null} />;
}