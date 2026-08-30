'use client';

import { usePathname, useRouter } from 'next/navigation';
import { PageWrapper, Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui';
import { User, Bell, Lock, Key } from 'lucide-react';

const settingsMenu = [
  { id: 'profile', label: 'Profile', icon: User, href: '/portal/settings/profile' },
  {
    id: 'notifications',
    label: 'Notifications',
    icon: Bell,
    href: '/portal/settings/notifications',
  },
  { id: 'security', label: 'Security', icon: Lock, href: '/portal/settings/security' },
  { id: 'api-keys', label: 'API Keys', icon: Key, href: '/portal/settings/api-keys' },
];

export default function SettingsPage() {
  const router = useRouter();
  const pathname = usePathname();

  const activeTab = settingsMenu.find((item) => pathname.includes(item.id))?.id || 'profile';

  const handleTabChange = (tabId: string) => {
    const item = settingsMenu.find((m) => m.id === tabId);
    if (item) {
      router.push(item.href);
    }
  };

  return (
    <PageWrapper>
      <div className="mx-auto max-w-4xl">
        <div className="mb-8">
          <h1 className="text-3xl font-bold">Settings</h1>
          <p className="mt-2 text-gray-600">Manage your account, preferences, and security</p>
        </div>

        <Tabs defaultValue={activeTab} onValueChange={handleTabChange} className="w-full">
          <TabsList className="grid w-full grid-cols-4">
            {settingsMenu.map((item) => (
              <TabsTrigger key={item.id} value={item.id} className="flex items-center gap-2">
                <item.icon className="h-4 w-4" />
                <span className="hidden sm:inline">{item.label}</span>
              </TabsTrigger>
            ))}
          </TabsList>

          {settingsMenu.map((item) => (
            <TabsContent key={item.id} value={item.id} className="mt-6">
              <div className="rounded-lg bg-white p-6 shadow">
                <h2 className="mb-4 text-2xl font-semibold">{item.label}</h2>
                <button
                  onClick={() => router.push(item.href)}
                  className="text-sm font-medium text-blue-600 hover:text-blue-700"
                >
                  Go to {item.label} Settings →
                </button>
              </div>
            </TabsContent>
          ))}
        </Tabs>

        {/* Settings Summary Card */}
        <div className="mt-8 rounded-lg border border-blue-200 bg-blue-50 p-6">
          <h3 className="font-semibold text-blue-900">Tips for Securing Your Account</h3>
          <ul className="mt-3 space-y-2 text-sm text-blue-800">
            <li>✓ Enable two-factor authentication in Security settings</li>
            <li>✓ Review and manage API keys regularly</li>
            <li>✓ Keep your notification preferences up to date</li>
            <li>✓ Update your profile information to receive accurate notifications</li>
          </ul>
        </div>
      </div>
    </PageWrapper>
  );
}
