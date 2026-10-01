/**
 * Opaque keyset-pagination cursors (#1434, reused by the FHIR API #1435).
 *
 * A cursor encodes the sort key of the last item on a page — `createdAt` plus
 * `_id` as a tie-breaker — as base64url JSON. Clients treat it as opaque; the
 * server turns it back into a range filter so page N costs the same index
 * seek as page 1 (no `skip`).
 */
import { Types } from 'mongoose';

const CURSOR_VERSION = 1;

export interface CursorPosition {
  createdAt: Date;
  id: string;
}

export class InvalidCursorError extends Error {
  constructor() {
    super('Invalid or expired pagination cursor');
    this.name = 'InvalidCursorError';
  }
}

export function encodeCursor(position: CursorPosition): string {
  return Buffer.from(
    JSON.stringify({ v: CURSOR_VERSION, c: position.createdAt.toISOString(), i: position.id }),
    'utf8'
  ).toString('base64url');
}

export function decodeCursor(cursor: string): CursorPosition {
  let parsed: unknown;
  try {
    parsed = JSON.parse(Buffer.from(cursor, 'base64url').toString('utf8'));
  } catch {
    throw new InvalidCursorError();
  }
  const { v, c, i } = (parsed ?? {}) as { v?: unknown; c?: unknown; i?: unknown };
  const createdAt = typeof c === 'string' ? new Date(c) : null;
  if (
    v !== CURSOR_VERSION ||
    !createdAt ||
    Number.isNaN(createdAt.getTime()) ||
    typeof i !== 'string' ||
    !Types.ObjectId.isValid(i) ||
    String(new Types.ObjectId(i)) !== i
  ) {
    throw new InvalidCursorError();
  }
  return { createdAt, id: i };
}

/**
 * Mongo filter selecting documents strictly after `position` in
 * `{ createdAt: -1, _id: -1 }` order (newest first).
 */
export function afterCursorFilter(position: CursorPosition): Record<string, unknown> {
  const id = new Types.ObjectId(position.id);
  return {
    $or: [
      { createdAt: { $lt: position.createdAt } },
      { createdAt: position.createdAt, _id: { $lt: id } },
    ],
  };
}

export const NEWEST_FIRST = { createdAt: -1, _id: -1 } as const;
