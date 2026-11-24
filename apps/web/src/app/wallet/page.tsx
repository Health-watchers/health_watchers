import { Metadata } from 'next';
import WalletClient from './WalletClient';

export const metadata: Metadata = {
  title: 'Wallet',
  description: "Manage your clinic's Stellar wallet, view XLM balance, and send payments.",
};

export default function WalletPage() {
  return (
    <div className="min-h-screen bg-gray-50 text-gray-900 dark:bg-gray-900 dark:text-gray-100">
      <WalletClient />
    </div>
  );
}