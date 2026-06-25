import { FeeOptimizerService } from '../services/fee-optimizer.service';

describe('FeeOptimizerService', () => {
  let service: FeeOptimizerService;

  beforeEach(() => {
    service = new FeeOptimizerService();
  });

  it('selects fast for high-value payments', () => {
    const strategy = service.selectStrategy(1500, { congestionLevel: 'low', currentHour: 14 });
    expect(strategy).toBe('fast');
  });

  it('selects fast when network congestion is high', () => {
    const strategy = service.selectStrategy(10, { congestionLevel: 'high', currentHour: 14 });
    expect(strategy).toBe('fast');
  });

  it('selects slow during off-peak hours with low congestion', () => {
    const strategy = service.selectStrategy(50, { congestionLevel: 'low', currentHour: 3 });
    expect(strategy).toBe('slow');
  });

  it('selects standard as default during peak hours', () => {
    const strategy = service.selectStrategy(50, { congestionLevel: 'medium', currentHour: 10 });
    expect(strategy).toBe('standard');
  });

  it('fast overrides off-peak when congestion is high', () => {
    const strategy = service.selectStrategy(50, { congestionLevel: 'high', currentHour: 2 });
    expect(strategy).toBe('fast');
  });
});
