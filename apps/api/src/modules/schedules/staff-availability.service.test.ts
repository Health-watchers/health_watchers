import { isStaffAvailable } from './staff-availability.service';
import { ScheduleModel } from './models/schedule.model';

jest.mock('./models/schedule.model', () => ({
  ScheduleModel: {
    findOne: jest.fn(),
  },
}));

describe('staff availability', () => {
  afterEach(() => {
    jest.clearAllMocks();
  });

  it('returns true when a direct schedule exists', async () => {
    (ScheduleModel.findOne as jest.Mock).mockReturnValueOnce({
      lean: jest.fn().mockResolvedValue({ userId: 'u1' }),
    });

    await expect(isStaffAvailable('u1', 'c1', new Date('2024-06-03T10:00:00.000Z'))).resolves.toBe(
      true
    );
  });

  it('checks recurring schedules when no direct schedule exists', async () => {
    (ScheduleModel.findOne as jest.Mock)
      .mockReturnValueOnce({ lean: jest.fn().mockResolvedValue(null) })
      .mockReturnValueOnce({ lean: jest.fn().mockResolvedValue({ recurringDay: 'MONDAY' }) });

    await expect(isStaffAvailable('u1', 'c1', new Date('2024-06-03T10:00:00.000Z'))).resolves.toBe(
      true
    );
    expect(ScheduleModel.findOne).toHaveBeenLastCalledWith(
      expect.objectContaining({ recurringDay: 'MONDAY' })
    );
  });
});
