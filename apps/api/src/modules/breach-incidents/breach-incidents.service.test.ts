import { calculateNotificationDeadline } from './breach-incidents.service';

describe('breach incident workflow', () => {
  it('sets the notification deadline to 60 calendar days after discovery', () => {
    const deadline = calculateNotificationDeadline(new Date('2024-01-01T00:00:00.000Z'));

    expect(deadline.toISOString()).toBe('2024-03-01T00:00:00.000Z');
  });
});
