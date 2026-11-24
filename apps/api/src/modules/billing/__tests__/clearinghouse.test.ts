import {
  AvailityClearinghouse,
  ChangeHealthcareClearinghouse,
  StubClearinghouse,
  getClearinghouse,
  resolveProvider,
} from '../clearinghouse';

const EDI = 'ISA*00~ST*837*0001~SV1*HC:99213*150.00*UN*1***A~SE*9*0001~';

const submission = (claimId: string, overrides = {}) => ({
  claimId,
  clinicId: 'clinic1',
  edi837: EDI,
  totalAmount: 150,
  frequencyCode: '1' as const,
  ...overrides,
});

describe('resolveProvider', () => {
  it.each([
    ['availity', 'availity'],
    ['Change-Healthcare', 'change_healthcare'],
    ['chc', 'change_healthcare'],
    ['', 'mock'],
    [undefined, 'mock'],
  ])('maps %p to %s', (input, expected) => {
    expect(resolveProvider(input as string | undefined)).toBe(expected);
  });

  it('returns a singleton adapter per provider', () => {
    expect(getClearinghouse('availity')).toBe(getClearinghouse('availity'));
    expect(getClearinghouse('availity')).toBeInstanceOf(AvailityClearinghouse);
    expect(getClearinghouse('change_healthcare')).toBeInstanceOf(ChangeHealthcareClearinghouse);
  });
});

describe('StubClearinghouse', () => {
  it('rejects an 837 with no service lines at the front end', async () => {
    const ch = new StubClearinghouse('mock', 'Mock Payer');
    const result = await ch.submitClaim(submission('c-empty', { edi837: 'ISA*00~' }));
    expect(result.accepted).toBe(false);
    expect((await ch.getClaimStatus(result.submissionId)).status).toBe('rejected');
  });

  it('is deterministic per claim id', async () => {
    const a = new StubClearinghouse('mock', 'Mock Payer');
    const b = new StubClearinghouse('mock', 'Mock Payer');
    const ra = await a.submitClaim(submission('claim-42'));
    const rb = await b.submitClaim(submission('claim-42'));
    expect((await a.getClaimStatus(ra.submissionId)).status).toBe(
      (await b.getClaimStatus(rb.submissionId)).status
    );
  });

  it('pays corrected (frequency 7) claims and produces a balanced ERA', async () => {
    const ch = new StubClearinghouse('availity', 'Payer');
    const { submissionId } = await ch.submitClaim(submission('corrected', { frequencyCode: '7' }));
    expect((await ch.getClaimStatus(submissionId)).status).toBe('paid');

    const [era] = await ch.fetchRemittances([submissionId]);
    expect(era.paidAmount).toBeGreaterThan(0);
    const adjustments = era.adjustments.reduce((s, a) => s + a.amount, 0);
    expect(era.paidAmount + adjustments).toBeCloseTo(era.billedAmount, 2);
  });

  it('keeps claims in adjudication until the settle delay passes', async () => {
    const ch = new StubClearinghouse('mock', 'Payer', 60_000);
    const { submissionId } = await ch.submitClaim(submission('slow', { frequencyCode: '7' }));
    expect((await ch.getClaimStatus(submissionId)).status).toBe('accepted');
    expect(await ch.fetchRemittances([submissionId])).toEqual([]);
  });

  it('reports unknown submissions as pending', async () => {
    const ch = new StubClearinghouse('mock', 'Payer');
    expect((await ch.getClaimStatus('nope')).status).toBe('pending');
  });
});
