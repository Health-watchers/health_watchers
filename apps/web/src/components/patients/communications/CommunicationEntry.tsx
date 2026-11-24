'use client';

import { useState } from 'react';
import { type CommunicationLog } from '@/lib/queries/useCommunications';

const CHANNEL_ICONS: Record<CommunicationLog['channel'], string> = {
  sms: '💬',
  whatsapp: '📱',
  email: '✉️',
  phone_call: '📞',
  in_person: '🏥',
};

const STATUS_COLORS: Record<CommunicationLog['status'], string> = {
  sent: 'bg-blue-100 text-blue-800',
  delivered: 'bg-green-100 text-green-800',
  failed: 'bg-red-100 text-red-800',
  read: 'bg-gray-100 text-gray-800',
};

interface Props {
  log: CommunicationLog;
}

export function CommunicationEntry({ log }: Props) {
  const [expanded, setExpanded] = useState(false);
  const preview = log.content.length > 120 ? log.content.slice(0, 120) + '…' : log.content;

  return (
    <div className="space-y-2 rounded-lg border border-gray-200 p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <span className="text-lg">{CHANNEL_ICONS[log.channel]}</span>
          <span className="font-medium capitalize">{log.channel.replace('_', ' ')}</span>
          <span
            className={`inline-flex items-center rounded px-2 py-0.5 text-xs font-medium ${
              log.direction === 'outbound'
                ? 'bg-indigo-100 text-indigo-800'
                : 'bg-yellow-100 text-yellow-800'
            }`}
          >
            {log.direction}
          </span>
          <span
            className={`inline-flex items-center rounded px-2 py-0.5 text-xs font-medium ${STATUS_COLORS[log.status]}`}
          >
            {log.status}
          </span>
        </div>
        <span className="text-xs text-gray-500">{new Date(log.sentAt).toLocaleString()}</span>
      </div>
      <p className="text-sm text-gray-700">
        {expanded ? log.content : preview}
        {log.content.length > 120 && (
          <button
            className="ml-1 text-xs text-indigo-600 hover:underline"
            onClick={() => setExpanded((e) => !e)}
          >
            {expanded ? 'Show less' : 'Show more'}
          </button>
        )}
      </p>
    </div>
  );
}
