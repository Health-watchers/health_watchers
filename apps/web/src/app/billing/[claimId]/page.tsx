import { Metadata } from 'next';
import ClaimDetailClient from './ClaimDetailClient';

export const metadata: Metadata = {
  title: 'Claim detail',
};

export default function ClaimDetailPage({ params }: { params: { claimId: string } }) {
  return <ClaimDetailClient claimId={params.claimId} />;
}
