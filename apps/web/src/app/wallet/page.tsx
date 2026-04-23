import { Metadata } from 'next';
import WalletClient from './WalletClient';

export const metadata: Metadata = {
  title: 'Wallet',
  description: "Manage your clinic's Stellar wallet, view XLM balance, and send payments.",
};

export default function WalletPage() {
  return <WalletClient />;
}
