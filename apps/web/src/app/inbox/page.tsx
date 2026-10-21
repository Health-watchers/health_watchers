import { Suspense } from 'react';
import InboxClient from './InboxClient';

export const metadata = { title: 'Care Team Inbox' };

export default function InboxPage() {
  return (
    // useSearchParams (selected thread lives in ?thread=) needs a Suspense boundary
    <Suspense fallback={null}>
      <InboxClient />
    </Suspense>
  );
}
