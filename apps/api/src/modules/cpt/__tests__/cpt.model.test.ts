import { CPTModel } from '../cpt.model';

describe('CPTModel', () => {
  it('validates a complete CPT code record', async () => {
    const cpt = new CPTModel({
      code: '99213',
      description: 'Office visit, established patient',
      category: 'office-visit',
      defaultFee: '125.00',
    });
    await expect(cpt.validate()).resolves.toBeUndefined();
  });

  it('requires code, description, category and defaultFee', async () => {
    const cpt = new CPTModel({});
    await expect(cpt.validate()).rejects.toThrow();
  });

  it('rejects an invalid category', async () => {
    const cpt = new CPTModel({
      code: '99213',
      description: 'Office visit',
      category: 'surgery',
      defaultFee: '125.00',
    });
    await expect(cpt.validate()).rejects.toThrow();
  });
});
