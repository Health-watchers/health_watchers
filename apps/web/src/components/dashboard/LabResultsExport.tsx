'use client';

import { Download, Share2, FileJson, FileText } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { LabResult } from './LabResultsTable';
import { formatDate } from '@/lib/dateUtils';

interface LabResultsExportProps {
  results: LabResult[];
  patientName?: string;
  isLoading?: boolean;
}

export function LabResultsExport({
  results,
  patientName = 'Patient',
  isLoading = false,
}: LabResultsExportProps) {
  const generateCSV = () => {
    const headers = [
      'Test Name',
      'Value',
      'Unit',
      'Reference Min',
      'Reference Max',
      'Status',
      'Date',
      'Notes',
    ];
    const rows = results.map((r) => [
      r.testName,
      r.value,
      r.unit,
      r.referenceMin,
      r.referenceMax,
      r.status,
      formatDate(r.testDate),
      r.notes || '',
    ]);

    const csv = [
      headers.join(','),
      ...rows.map((row) => row.map((cell) => `"${String(cell).replace(/"/g, '""')}"`).join(',')),
    ].join('\n');

    downloadFile(csv, `lab-results-${patientName}-${Date.now()}.csv`, 'text/csv');
  };

  const generateJSON = () => {
    const data = {
      patient: patientName,
      exportDate: new Date().toISOString(),
      results: results.map((r) => ({
        id: r.id,
        testName: r.testName,
        value: r.value,
        unit: r.unit,
        referenceRange: {
          min: r.referenceMin,
          max: r.referenceMax,
        },
        status: r.status,
        testDate: r.testDate.toISOString(),
        notes: r.notes,
        previousValue: r.previousValue,
      })),
    };

    const json = JSON.stringify(data, null, 2);
    downloadFile(json, `lab-results-${patientName}-${Date.now()}.json`, 'application/json');
  };

  const generatePDF = () => {
    const content = generatePDFContent();
    downloadFile(content, `lab-results-${patientName}-${Date.now()}.pdf`, 'application/pdf');
  };

  const downloadFile = (content: string, filename: string, mimeType: string) => {
    const blob = new Blob([content], { type: mimeType });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  const generatePDFContent = () => {
    let content = `%PDF-1.4
1 0 obj
<< /Type /Catalog /Pages 2 0 R >>
endobj
2 0 obj
<< /Type /Pages /Kids [3 0 R] /Count 1 >>
endobj
3 0 obj
<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Contents 4 0 R /Resources << /Font << /F1 5 0 R >> >> >>
endobj
4 0 obj
<< /Length ${generatePDFContentStream().length} >>
stream
${generatePDFContentStream()}
endstream
endobj
5 0 obj
<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>
endobj
xref
0 6
0000000000 65535 f
0000000009 00000 n
0000000058 00000 n
0000000115 00000 n
0000000247 00000 n
0000000382 00000 n
trailer
<< /Size 6 /Root 1 0 R >>
startxref
461
%%EOF`;

    return content;
  };

  const generatePDFContentStream = () => {
    let stream = 'BT\n/F1 12 Tf\n50 750 Td\n(Lab Results Report) Tj\nET\n';
    let y = 720;

    results.forEach((result, index) => {
      stream += `BT\n/F1 10 Tf\n50 ${y} Td\n(${result.testName}: ${result.value} ${result.unit}) Tj\nET\n`;
      y -= 20;
    });

    return stream;
  };

  const copyToClipboard = async () => {
    const text = results.map((r) => `${r.testName}: ${r.value} ${r.unit}`).join('\n');

    try {
      await navigator.clipboard.writeText(text);
      alert('Results copied to clipboard!');
    } catch (err) {
      console.error('Failed to copy:', err);
    }
  };

  if (results.length === 0) {
    return null;
  }

  return (
    <div className="rounded-lg border border-gray-200 bg-white p-6 dark:border-gray-700 dark:bg-gray-800">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100">Export Results</h3>
          <p className="mt-1 text-sm text-gray-600 dark:text-gray-400">
            Download or share your lab results in multiple formats
          </p>
        </div>
      </div>

      <div className="mt-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Button
          onClick={generateCSV}
          disabled={isLoading}
          variant="outline"
          className="flex items-center justify-center gap-2"
        >
          <FileText className="h-4 w-4" />
          <span>CSV</span>
        </Button>

        <Button
          onClick={generateJSON}
          disabled={isLoading}
          variant="outline"
          className="flex items-center justify-center gap-2"
        >
          <FileJson className="h-4 w-4" />
          <span>JSON</span>
        </Button>

        <Button
          onClick={generatePDF}
          disabled={isLoading}
          variant="outline"
          className="flex items-center justify-center gap-2"
        >
          <Download className="h-4 w-4" />
          <span>PDF</span>
        </Button>

        <Button
          onClick={copyToClipboard}
          disabled={isLoading}
          variant="outline"
          className="flex items-center justify-center gap-2"
        >
          <Share2 className="h-4 w-4" />
          <span>Copy</span>
        </Button>
      </div>

      <div className="mt-4 rounded-lg bg-blue-50 p-3 dark:bg-blue-900/20">
        <p className="text-sm text-blue-800 dark:text-blue-200">
          💡 You can share your lab results with healthcare providers or use them for personal
          records.
        </p>
      </div>
    </div>
  );
}
