process.env.MONGO_URI = 'mongodb://localhost:27017/test';
process.env.JWT_ACCESS_TOKEN_SECRET = 'test-access-secret-32-chars-long!!';
process.env.JWT_REFRESH_TOKEN_SECRET = 'test-refresh-secret-32-chars-long!';

jest.mock('@health-watchers/config', () => ({
  config: {
    jwt: {
      accessTokenSecret: 'test-access-secret-32-chars-long!!',
      refreshTokenSecret: 'test-refresh-secret-32-chars-long!',
      issuer: 'health-watchers-api',
      audience: 'health-watchers-client',
    },
    nodeEnv: 'test',
    mongoUri: '',
  },
}));

import { paginate, parsePagination, paginateCursor, parseCursorPagination } from './paginate';
import { Model, Types } from 'mongoose';

// ── Helpers ───────────────────────────────────────────────────────────────────
function makeId() {
  return new Types.ObjectId();
}

function mockModel(docs: unknown[], total: number) {
  const chainable = {
    sort: jest.fn().mockReturnThis(),
    skip: jest.fn().mockReturnThis(),
    limit: jest.fn().mockImplementation((n: number) => ({
      lean: jest.fn().mockResolvedValue(docs.slice(0, n)),
    })),
    lean: jest.fn().mockResolvedValue(docs),
  };
  return {
    countDocuments: jest.fn().mockResolvedValue(total),
    find: jest.fn().mockReturnValue(chainable),
    _chainable: chainable,
  } as unknown as Model<unknown>;
}

// ── paginate() ────────────────────────────────────────────────────────────────
describe('paginate()', () => {
  it('returns data and correct meta for first page', async () => {
    const docs = [{ _id: makeId() }, { _id: makeId() }];
    const model = mockModel(docs, 25);
    const result = await paginate(model, {}, 1, 10);
    expect(result.data).toEqual(docs.slice(0, 10));
    expect(result.meta.total).toBe(25);
    expect(result.meta.page).toBe(1);
    expect(result.meta.limit).toBe(10);
    expect(result.meta.totalPages).toBe(3);
    expect(result.meta.hasNextPage).toBe(true);
  });

  it('hasNextPage is false on the last page', async () => {
    const docs = [{ _id: makeId() }];
    const model = mockModel(docs, 5);
    const result = await paginate(model, {}, 1, 10);
    expect(result.meta.hasNextPage).toBe(false);
    expect(result.meta.nextCursor).toBeNull();
  });

  it('nextCursor is the _id of the last document when hasNextPage is true', async () => {
    const lastId = makeId();
    const docs = [{ _id: makeId() }, { _id: lastId }];
    const model = mockModel(docs, 30);
    const result = await paginate(model, {}, 1, 2);
    expect(result.meta.hasNextPage).toBe(true);
    expect(result.meta.nextCursor).toBe(lastId.toString());
  });

  it('totalPages rounds up', async () => {
    const model = mockModel([], 11);
    const result = await paginate(model, {}, 1, 5);
    expect(result.meta.totalPages).toBe(3);
  });
});

// ── parsePagination() ─────────────────────────────────────────────────────────
describe('parsePagination()', () => {
  it('returns default page=1 limit=20 for empty query', () => {
    expect(parsePagination({})).toEqual({ page: 1, limit: 20 });
  });

  it('parses page and limit from query string values', () => {
    expect(parsePagination({ page: '3', limit: '50' })).toEqual({ page: 3, limit: 50 });
  });

  it('clamps page to minimum 1', () => {
    expect(parsePagination({ page: '-5' })).toEqual({ page: 1, limit: 20 });
  });

  it('returns null when limit exceeds 100', () => {
    expect(parsePagination({ limit: '101' })).toBeNull();
  });

  it('falls back to default limit 20 when limit is 0 (falsy parseInt)', () => {
    expect(parsePagination({ limit: '0' })).toEqual({ page: 1, limit: 20 });
  });
});

// ── paginateCursor() ──────────────────────────────────────────────────────────
describe('paginateCursor()', () => {
  function mockCursorModel(docs: unknown[]) {
    const chainable = {
      sort: jest.fn().mockReturnThis(),
      limit: jest.fn().mockImplementation((n: number) => ({
        lean: jest.fn().mockResolvedValue(docs.slice(0, n)),
      })),
    };
    return {
      find: jest.fn().mockReturnValue(chainable),
      _chainable: chainable,
    } as unknown as Model<unknown>;
  }

  it('returns data with hasNextPage=false when fewer docs than limit', async () => {
    const docs = [{ _id: makeId() }, { _id: makeId() }];
    const model = mockCursorModel(docs);
    const result = await paginateCursor(model, {}, 5);
    expect(result.data).toHaveLength(2);
    expect(result.meta.hasNextPage).toBe(false);
    expect(result.meta.nextCursor).toBeNull();
  });

  it('hasNextPage=true and nextCursor set when more docs exist', async () => {
    const ids = Array.from({ length: 6 }, makeId);
    const docs = ids.map((id) => ({ _id: id }));
    const model = mockCursorModel(docs);
    const result = await paginateCursor(model, {}, 5);
    expect(result.meta.hasNextPage).toBe(true);
    expect(result.data).toHaveLength(5);
    expect(result.meta.nextCursor).toBe(ids[4].toString());
  });

  it('passes cursor as _id $lt filter for descending sort', async () => {
    const cursorId = makeId();
    const model = mockCursorModel([]);
    await paginateCursor(model, {}, 10, cursorId.toString(), { _id: -1 });
    const findCall = (model.find as jest.Mock).mock.calls[0][0];
    expect(findCall._id).toEqual({ $lt: cursorId });
  });

  it('passes cursor as _id $gt filter for ascending sort', async () => {
    const cursorId = makeId();
    const model = mockCursorModel([]);
    await paginateCursor(model, {}, 10, cursorId.toString(), { _id: 1 });
    const findCall = (model.find as jest.Mock).mock.calls[0][0];
    expect(findCall._id).toEqual({ $gt: cursorId });
  });
});

// ── parseCursorPagination() ───────────────────────────────────────────────────
describe('parseCursorPagination()', () => {
  it('returns default limit=20 with no cursor for empty query', () => {
    expect(parseCursorPagination({})).toEqual({ limit: 20, cursor: undefined });
  });

  it('parses limit and cursor from query', () => {
    const id = makeId().toString();
    expect(parseCursorPagination({ limit: '50', cursor: id })).toEqual({
      limit: 50,
      cursor: id,
    });
  });

  it('returns null when limit exceeds 100', () => {
    expect(parseCursorPagination({ limit: '101' })).toBeNull();
  });

  it('falls back to default limit 20 when limit is 0 (falsy parseInt)', () => {
    expect(parseCursorPagination({ limit: '0' })).toEqual({ limit: 20, cursor: undefined });
  });
});
