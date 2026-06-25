import { detectUnrecognizedTransactions } from '../unrecognized-transaction.service';

jest.mock('../unrecognized-transaction.model', () => ({
  UnrecognizedTransactionModel: {
    findOneAndUpdate: jest.fn().mockResolvedValue({}),
  },
}));

import { UnrecognizedTransactionModel } from '../unrecognized-transaction.model';

const mockTxs = [
  { hash: 'abc123', from: 'GABC', to: 'GXYZ', amount: '100', asset: 'XLM' },
  { hash: 'def456', from: 'GDEF', to: 'GXYZ', amount: '50', asset: 'XLM' },
  { hash: 'ghi789', from: 'GGHI', to: 'GXYZ', amount: '200', asset: 'XLM' },
];

describe('detectUnrecognizedTransactions', () => {
  beforeEach(() => jest.clearAllMocks());

  it('returns no unrecognized txs when all match known hashes', async () => {
    const known = new Set(['abc123', 'def456', 'ghi789']);
    const result = await detectUnrecognizedTransactions(mockTxs, known, 'clinic1');
    expect(result).toHaveLength(0);
    expect(UnrecognizedTransactionModel.findOneAndUpdate).not.toHaveBeenCalled();
  });

  it('flags transactions not in known set', async () => {
    const known = new Set(['abc123']);
    const result = await detectUnrecognizedTransactions(mockTxs, known, 'clinic1');
    expect(result).toHaveLength(2);
    expect(result.map((t) => t.hash)).toEqual(['def456', 'ghi789']);
  });

  it('persists each unrecognized transaction via upsert', async () => {
    const known = new Set<string>();
    await detectUnrecognizedTransactions(mockTxs, known, 'clinic1');
    expect(UnrecognizedTransactionModel.findOneAndUpdate).toHaveBeenCalledTimes(3);
  });

  it('handles empty incoming transaction list', async () => {
    const result = await detectUnrecognizedTransactions([], new Set(), 'clinic1');
    expect(result).toHaveLength(0);
  });

  it('does not duplicate already-stored transactions (upsert by hash)', async () => {
    const known = new Set<string>();
    await detectUnrecognizedTransactions([mockTxs[0]], known, 'clinic1');
    await detectUnrecognizedTransactions([mockTxs[0]], known, 'clinic1');
    const calls = (UnrecognizedTransactionModel.findOneAndUpdate as jest.Mock).mock.calls;
    expect(calls[0][0]).toEqual({ stellarTxHash: 'abc123' });
    expect(calls[1][0]).toEqual({ stellarTxHash: 'abc123' });
  });
});
