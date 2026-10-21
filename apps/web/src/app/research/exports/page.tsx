import { Metadata } from 'next';
import ResearchExportsClient from './ResearchExportsClient';

export const metadata: Metadata = {
  title: 'Research Exports',
  description: 'Request and download de-identified research datasets.',
};

export default function ResearchExportsPage() {
  return <ResearchExportsClient />;
}
