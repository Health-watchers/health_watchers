import { Request, Response } from 'express';
import { feeBudgetCheck } from '../fee-budget-check.middleware';
import { checkFeeBudget } from '../../modules/payments/services/fee-budget.service';

jest.mock('../../modules/payments/services/fee-budget.service', () => ({
  checkFeeBudget: jest.fn(),
}));

describe('feeBudgetCheck', () => {
  afterEach(() => jest.clearAllMocks());

  it('calls next immediately when sponsorFee is not requested', async () => {
    const req = { body: {} } as Request;
    const next = jest.fn();

    await feeBudgetCheck(req, {} as Response, next);

    expect(checkFeeBudget).not.toHaveBeenCalled();
    expect(next).toHaveBeenCalledTimes(1);
  });

  it('calls next immediately when there is no clinic context', async () => {
    const req = { body: { sponsorFee: true } } as Request;
    const next = jest.fn();

    await feeBudgetCheck(req, {} as Response, next);

    expect(checkFeeBudget).not.toHaveBeenCalled();
    expect(next).toHaveBeenCalledTimes(1);
  });

  it('sets feeSponsorshipAllowed true when budget check passes', async () => {
    (checkFeeBudget as jest.Mock).mockResolvedValue(true);
    const req = { body: { sponsorFee: true }, user: { clinicId: 'c1' } } as Request;
    const next = jest.fn();

    await feeBudgetCheck(req, {} as Response, next);

    expect(checkFeeBudget).toHaveBeenCalledWith('c1', 1000);
    expect((req as any).feeSponsorshipAllowed).toBe(true);
    expect(next).toHaveBeenCalledTimes(1);
  });

  it('sets feeSponsorshipAllowed false when the budget is exhausted', async () => {
    (checkFeeBudget as jest.Mock).mockResolvedValue(false);
    const req = { body: { sponsorFee: true }, user: { clinicId: 'c1' } } as Request;
    const next = jest.fn();

    await feeBudgetCheck(req, {} as Response, next);

    expect((req as any).feeSponsorshipAllowed).toBe(false);
    expect(next).toHaveBeenCalledTimes(1);
  });

  it('sets feeSponsorshipAllowed false and still calls next when the budget check throws', async () => {
    (checkFeeBudget as jest.Mock).mockRejectedValue(new Error('db unavailable'));
    const req = { body: { sponsorFee: true }, user: { clinicId: 'c1' } } as Request;
    const next = jest.fn();

    await feeBudgetCheck(req, {} as Response, next);

    expect((req as any).feeSponsorshipAllowed).toBe(false);
    expect(next).toHaveBeenCalledTimes(1);
  });
});
