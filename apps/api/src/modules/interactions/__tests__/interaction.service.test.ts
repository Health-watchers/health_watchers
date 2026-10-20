import interactionService from '../interaction.service';
import { DrugModel } from '../drug.model';
import { InteractionModel } from '../interaction.model';
import { FoodInteractionModel } from '../food-interaction.model';
import { InteractionCheckLogModel } from '../interaction-check-log.model';
import { InteractionDataStatusModel } from '../interaction-data-status.model';
import { checkResultCache } from '../interaction-cache';

jest.mock('../../audit/audit.service', () => ({
  auditLog: jest.fn().mockResolvedValue(undefined),
}));

describe('InteractionService', () => {
  beforeEach(() => {
    checkResultCache.clear();
    jest.restoreAllMocks();
    jest.spyOn(DrugModel, 'find').mockReturnValue({ lean: jest.fn().mockResolvedValue([]) } as any);
    jest
      .spyOn(InteractionModel, 'find')
      .mockReturnValue({ lean: jest.fn().mockResolvedValue([]) } as any);
    jest
      .spyOn(FoodInteractionModel, 'find')
      .mockReturnValue({ lean: jest.fn().mockResolvedValue([]) } as any);
    jest.spyOn(InteractionCheckLogModel, 'create').mockResolvedValue({} as any);
  });

  describe('check', () => {
    it('detects a critical drug-drug interaction', async () => {
      const result = await interactionService.check({
        medications: ['sildenafil', 'nitroglycerin'],
        includeFood: false,
      });
      expect(result.severity).toBe('critical');
      expect(result.drugDrugInteractions).toHaveLength(1);
      expect(result.disclaimer).toBeTruthy();
    });

    it('returns resolved and unresolved medications', async () => {
      const result = await interactionService.check({
        medications: ['warfarin', 'totally-unknown-drug'],
        includeFood: false,
      });
      expect(result.resolvedMedications.map((d) => d.genericName)).toEqual(['warfarin']);
      expect(result.unresolvedMedications).toEqual(['totally-unknown-drug']);
    });

    it('detects allergy interactions when provided', async () => {
      const result = await interactionService.check({
        medications: ['amoxicillin'],
        allergies: [{ allergen: 'amoxicillin', severity: 'severe' }],
        includeFood: false,
      });
      expect(result.allergyInteractions).toHaveLength(1);
      expect(result.allergyInteractions[0].severity).toBe('severe');
    });

    it('detects food interactions when includeFood defaults to true', async () => {
      const result = await interactionService.check({
        medications: ['simvastatin'],
      });
      expect(result.foodInteractions.some((f) => f.food === 'grapefruit juice')).toBe(true);
    });

    it('serves the second identical request from cache', async () => {
      const first = await interactionService.check({
        medications: ['warfarin', 'aspirin'],
        includeFood: false,
      });
      expect(first.cacheHit).toBe(false);

      const second = await interactionService.check({
        medications: ['aspirin', 'warfarin'],
        includeFood: false,
      });
      expect(second.cacheHit).toBe(true);
    });

    it('completes well under the 500ms acceptance target', async () => {
      const start = Date.now();
      await interactionService.check({
        medications: ['warfarin', 'aspirin', 'ibuprofen', 'simvastatin', 'clarithromycin'],
        includeFood: true,
      });
      const elapsed = Date.now() - start;
      expect(elapsed).toBeLessThan(500);
    });
  });

  describe('resolve / lookup', () => {
    it('resolves a brand name to its generic', async () => {
      const drug = await interactionService.resolve('Coumadin');
      expect(drug?.genericName).toBe('warfarin');
    });

    it('looks up by partial name and class', async () => {
      const byName = await interactionService.lookup('warf');
      expect(byName.some((d) => d.genericName === 'warfarin')).toBe(true);

      const byClass = await interactionService.lookup('statin');
      expect(byClass.length).toBeGreaterThanOrEqual(4);
    });
  });

  describe('refresh', () => {
    it('imports bundled data and records status', async () => {
      jest.spyOn(DrugModel, 'updateOne').mockResolvedValue({} as any);
      jest.spyOn(InteractionModel, 'updateOne').mockResolvedValue({} as any);
      jest.spyOn(FoodInteractionModel, 'updateOne').mockResolvedValue({} as any);
      jest.spyOn(InteractionDataStatusModel, 'updateOne').mockResolvedValue({} as any);

      const result = await interactionService.refresh();
      expect(result.imported.drugs).toBeGreaterThan(0);
      expect(result.imported.interactions).toBeGreaterThan(0);
      expect(result.imported.foodInteractions).toBeGreaterThan(0);
      expect(result.versions.drugCatalog).toBeTruthy();
    });
  });

  describe('dataStatus', () => {
    it('reports stale when no import has been recorded', async () => {
      jest.spyOn(InteractionDataStatusModel, 'find').mockReturnValue({
        lean: jest.fn().mockResolvedValue([]),
      } as any);
      const status = await interactionService.dataStatus();
      expect(status.stale).toBe(true);
      expect(status.lastImport).toBeNull();
    });

    it('reports fresh when imports are recent', async () => {
      jest.spyOn(InteractionDataStatusModel, 'find').mockReturnValue({
        lean: jest
          .fn()
          .mockResolvedValue([{ dataset: 'drug-drug', version: '2026.1', importedAt: new Date() }]),
      } as any);
      const status = await interactionService.dataStatus();
      expect(status.stale).toBe(false);
    });
  });

  describe('analytics', () => {
    it('aggregates check metrics from the log', async () => {
      jest.spyOn(InteractionCheckLogModel, 'countDocuments').mockResolvedValue(10 as any);
      jest
        .spyOn(InteractionCheckLogModel, 'aggregate')
        .mockImplementation((() => Promise.resolve([])) as any);

      const analytics = await interactionService.analytics(30);
      expect(analytics.totalChecks).toBe(10);
      expect(analytics.rangeDays).toBe(30);
      expect(typeof analytics.alertRate).toBe('number');
    });
  });
});
