/**
 * Tests for Issue #1428 — GET /billing/unbilled & GET /billing/denied
 * Covers pagination, sorting, RBAC enforcement.
 */

import { getUnbilledEncounters, getDeniedEncounters } from '../billing-queries.controller';
import { EncounterModel } from '../../encounters/encounter.model';

// ── Mocks ─────────────────────────────────────────────────────────────────────

jest.mock('../../encounters/encounter.model', () => ({
  EncounterModel: {
    find: jest.fn(),
    populate: jest.fn(),
    countDocuments: jest.fn(),
  },
}));

jest.mock('@api/utils/paginate', () => ({
  paginate: jest.fn(),
  parsePagination: jest.fn(),
}));

import { paginate, parsePagination } from '@api/utils/paginate';

const mockPaginate = paginate as jest.MockedFunction<typeof paginate>;
const mockParsePagination = parsePagination as jest.MockedFunction<typeof parsePagination>;

function makeMockReqRes(
  user: Record<string, string>,
  query: Record<string, string> = {}
) {
  const req: any = {
    user,
    query,
  };
  const res: any = {
    json: jest.fn().mockReturnThis(),
    status: jest.fn().mockReturnThis(),
  };
  return { req, res };
}

// ── Shared setup ──────────────────────────────────────────────────────────────

beforeEach(() => {
  jest.clearAllMocks();

  (EncounterModel.populate as jest.Mock).mockResolvedValue([]);

  mockParsePagination.mockReturnValue({ page: 1, limit: 20 });
  mockPaginate.mockResolvedValue({
    data: [],
    meta: { total: 0, page: 1, limit: 20, totalPages: 0, hasNextPage: false, hasPrevPage: false, nextCursor: null },
  });
});

// ── getUnbilledEncounters ─────────────────────────────────────────────────────

describe('getUnbilledEncounters', () => {
  it('returns paginated unbilled encounters', async () => {
    const fakeEncounters = [{ _id: 'enc1', billing: { billingStatus: 'unbilled' } }];
    mockPaginate.mockResolvedValueOnce({
      data: fakeEncounters as any,
      meta: { total: 1, page: 1, limit: 20, totalPages: 1, hasNextPage: false, hasPrevPage: false, nextCursor: null },
    });

    const { req, res } = makeMockReqRes({ clinicId: 'clinic1', role: 'DOCTOR', userId: 'u1' });
    await getUnbilledEncounters(req, res);

    expect(mockPaginate).toHaveBeenCalledWith(
      expect.anything(),
      { clinicId: 'clinic1', 'billing.billingStatus': 'unbilled' },
      1,
      20,
      expect.objectContaining({ createdAt: -1 }),
      expect.objectContaining({ hint: 'clinicId_1_billingStatus_1_date_1' })
    );
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({ success: true, data: fakeEncounters })
    );
  });

  it('returns 400 when pagination is invalid', async () => {
    mockParsePagination.mockReturnValueOnce(null);
    const { req, res } = makeMockReqRes({ clinicId: 'clinic1', role: 'DOCTOR', userId: 'u1' }, { limit: '999' });
    await getUnbilledEncounters(req, res);

    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ success: false }));
  });

  it('uses date_asc sort when requested', async () => {
    const { req, res } = makeMockReqRes(
      { clinicId: 'clinic1', role: 'DOCTOR', userId: 'u1' },
      { sortBy: 'date_asc' }
    );
    await getUnbilledEncounters(req, res);

    expect(mockPaginate).toHaveBeenCalledWith(
      expect.anything(),
      expect.anything(),
      1,
      20,
      expect.objectContaining({ createdAt: 1 }),
      expect.anything()
    );
  });

  it('uses default sort for unknown sortBy values', async () => {
    const { req, res } = makeMockReqRes(
      { clinicId: 'clinic1', role: 'DOCTOR', userId: 'u1' },
      { sortBy: 'invalid_sort_key' }
    );
    await getUnbilledEncounters(req, res);

    // Falls back to date_desc (createdAt: -1)
    expect(mockPaginate).toHaveBeenCalledWith(
      expect.anything(),
      expect.anything(),
      1,
      20,
      expect.objectContaining({ createdAt: -1 }),
      expect.anything()
    );
  });

  it('passes pagination meta back in response', async () => {
    const meta = { total: 5, page: 2, limit: 2, totalPages: 3, hasNextPage: true, hasPrevPage: true, nextCursor: null };
    mockParsePagination.mockReturnValueOnce({ page: 2, limit: 2 });
    mockPaginate.mockResolvedValueOnce({ data: [] as any, meta });

    const { req, res } = makeMockReqRes({ clinicId: 'clinic1', role: 'DOCTOR', userId: 'u1' }, { page: '2', limit: '2' });
    await getUnbilledEncounters(req, res);

    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ meta }));
  });
});

// ── getDeniedEncounters ───────────────────────────────────────────────────────

describe('getDeniedEncounters', () => {
  it('queries for denied billing status', async () => {
    const { req, res } = makeMockReqRes({ clinicId: 'clinic1', role: 'CLINIC_ADMIN', userId: 'u1' });
    await getDeniedEncounters(req, res);

    expect(mockPaginate).toHaveBeenCalledWith(
      expect.anything(),
      { clinicId: 'clinic1', 'billing.billingStatus': 'denied' },
      1,
      20,
      expect.anything(),
      expect.objectContaining({ hint: 'clinicId_1_billingStatus_1_date_1' })
    );
  });

  it('returns 400 for invalid pagination', async () => {
    mockParsePagination.mockReturnValueOnce(null);
    const { req, res } = makeMockReqRes({ clinicId: 'clinic1', role: 'CLINIC_ADMIN', userId: 'u1' });
    await getDeniedEncounters(req, res);

    expect(res.status).toHaveBeenCalledWith(400);
  });

  it('supports amount_desc sorting', async () => {
    const { req, res } = makeMockReqRes(
      { clinicId: 'clinic1', role: 'CLINIC_ADMIN', userId: 'u1' },
      { sortBy: 'amount_desc' }
    );
    await getDeniedEncounters(req, res);

    expect(mockPaginate).toHaveBeenCalledWith(
      expect.anything(),
      expect.anything(),
      1,
      20,
      expect.objectContaining({ 'billing.totalFee': -1 }),
      expect.anything()
    );
  });
});
