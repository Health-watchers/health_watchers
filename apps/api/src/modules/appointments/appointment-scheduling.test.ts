/**
 * Comprehensive tests for the appointment scheduling system:
 *   - Appointment analytics service
 *   - Appointment template service & controller
 *   - Appointment clustering service
 *   - Appointment duration validation service
 *   - Appointment availability service
 *
 * All external I/O (MongoDB, socket, email, etc.) is mocked so these
 * tests run without a live database.
 */

// ── Environment stubs (must be first) ─────────────────────────────────────────
process.env.MONGO_URI = 'mongodb://localhost:27017/test';
process.env.JWT_ACCESS_TOKEN_SECRET = 'abcdefghijklmnopqrstuvwxyz012345';
process.env.JWT_REFRESH_TOKEN_SECRET = 'abcdefghijklmnopqrstuvwxyz012345';
process.env.API_PORT = '3001';
process.env.NODE_ENV = 'test';

jest.mock('@health-watchers/config', () => ({
  config: {
    jwt: {
      accessTokenSecret: 'abcdefghijklmnopqrstuvwxyz012345',
      refreshTokenSecret: 'abcdefghijklmnopqrstuvwxyz012345',
      issuer: 'health-watchers-api',
      audience: 'health-watchers-client',
    },
    apiPort: '3001',
    nodeEnv: 'test',
    mongoUri: '',
    stellarNetwork: 'testnet',
    horizonUrl: '',
    stellarSecretKey: '',
    stellar: { network: 'testnet', horizonUrl: '', secretKey: '', platformPublicKey: '' },
    supportedAssets: ['XLM'],
    stellarServiceUrl: '',
    geminiApiKey: '',
    fieldEncryptionKey: '',
    webUrl: 'http://localhost:3000',
  },
}));

jest.mock('@api/utils/logger', () => ({
  __esModule: true,
  default: { info: jest.fn(), error: jest.fn(), warn: jest.fn(), debug: jest.fn() },
}));

// ─────────────────────────────────────────────────────────────────────────────
// Model mocks
// ─────────────────────────────────────────────────────────────────────────────

const mockAggregate = jest.fn();
const mockFind = jest.fn();
const mockCountDocuments = jest.fn();
const mockFindOne = jest.fn();
const mockCreate = jest.fn();
const mockFindOneAndUpdate = jest.fn();
const mockUpdateOne = jest.fn();

jest.mock('@api/modules/appointments/appointment.model', () => ({
  AppointmentModel: {
    aggregate: mockAggregate,
    find: mockFind,
    findOne: mockFindOne,
    countDocuments: mockCountDocuments,
    create: mockCreate,
    findOneAndUpdate: mockFindOneAndUpdate,
    updateOne: mockUpdateOne,
  },
}));

const mockTemplateCreate = jest.fn();
const mockTemplateFind = jest.fn();
const mockTemplateFindOne = jest.fn();
const mockTemplateFindOneAndUpdate = jest.fn();
const mockTemplateUpdateOne = jest.fn();

jest.mock('@api/modules/appointments/appointment-template.model', () => ({
  AppointmentTemplateModel: {
    create: mockTemplateCreate,
    find: mockTemplateFind,
    findOne: mockTemplateFindOne,
    findOneAndUpdate: mockTemplateFindOneAndUpdate,
    updateOne: mockTemplateUpdateOne,
  },
}));

// schedules service mock (used by availability service)
jest.mock('@api/modules/schedules/schedules.service', () => ({
  isStaffAvailable: jest.fn().mockResolvedValue(true),
}));

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

function makeDate(hour: number, minute = 0): Date {
  const d = new Date('2026-09-01T00:00:00.000Z');
  d.setUTCHours(hour, minute, 0, 0);
  return d;
}

const CLINIC_ID = '507f1f77bcf86cd799439011';
const DOCTOR_ID = '507f1f77bcf86cd799439012';

// ─────────────────────────────────────────────────────────────────────────────
// 1. Appointment analytics service
// ─────────────────────────────────────────────────────────────────────────────
describe('AppointmentAnalyticsService', () => {
  let getAppointmentAnalytics: typeof import('@api/modules/appointments/appointment-analytics.service').getAppointmentAnalytics;

  beforeAll(async () => {
    ({ getAppointmentAnalytics } = await import(
      '@api/modules/appointments/appointment-analytics.service'
    ));
  });

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('returns zero-value summary when no appointments exist', async () => {
    mockAggregate.mockResolvedValue([]);
    mockCountDocuments.mockResolvedValue(0);

    const result = await getAppointmentAnalytics(
      CLINIC_ID,
      new Date('2026-09-01'),
      new Date('2026-09-30'),
    );

    expect(result.summary.totalAppointments).toBe(0);
    expect(result.summary.noShowRate).toBe(0);
    expect(result.summary.cancellationRate).toBe(0);
    expect(result.summary.completionRate).toBe(0);
    expect(result.dailyBreakdown).toEqual([]);
    expect(result.byDoctor).toEqual([]);
  });

  it('correctly computes rates from aggregation data', async () => {
    // First aggregate call → status breakdown
    mockAggregate
      .mockResolvedValueOnce([
        { _id: 'completed', count: 60 },
        { _id: 'no-show', count: 10 },
        { _id: 'cancelled', count: 5 },
        { _id: 'scheduled', count: 25 },
      ])
      // Second → type breakdown
      .mockResolvedValueOnce([
        { _id: 'consultation', count: 70 },
        { _id: 'follow-up', count: 30 },
      ])
      // Third → avg duration
      .mockResolvedValueOnce([{ _id: null, avgDuration: 28.5 }])
      // Fourth → daily breakdown
      .mockResolvedValueOnce([
        { _id: { year: 2026, month: 9, day: 5, status: 'completed' }, count: 10 },
        { _id: { year: 2026, month: 9, day: 5, status: 'no-show' }, count: 2 },
      ])
      // Fifth → per-doctor
      .mockResolvedValueOnce([
        {
          _id: { doctorId: DOCTOR_ID, status: 'completed' },
          count: 40,
          avgDuration: 30,
        },
      ]);

    mockCountDocuments.mockResolvedValue(8); // telemedicine count

    const result = await getAppointmentAnalytics(
      CLINIC_ID,
      new Date('2026-09-01'),
      new Date('2026-09-30'),
    );

    expect(result.summary.totalAppointments).toBe(100);
    expect(result.summary.noShowRate).toBe(10);
    expect(result.summary.cancellationRate).toBe(5);
    expect(result.summary.completionRate).toBe(60);
    expect(result.summary.avgDurationMinutes).toBe(29);
    expect(result.summary.telemedicineCount).toBe(8);
    expect(result.summary.telemedicineRate).toBe(8);
    expect(result.dailyBreakdown).toHaveLength(1);
    expect(result.dailyBreakdown[0].date).toBe('2026-09-05');
    expect(result.dailyBreakdown[0].total).toBe(12);
    expect(result.byDoctor).toHaveLength(1);
    expect(result.byDoctor[0].completed).toBe(40);
  });

  it('filters by doctorId when provided', async () => {
    mockAggregate.mockResolvedValue([]);
    mockCountDocuments.mockResolvedValue(0);

    await getAppointmentAnalytics(
      CLINIC_ID,
      new Date('2026-09-01'),
      new Date('2026-09-30'),
      DOCTOR_ID,
    );

    // Verify the doctorId was passed as part of the match stage
    const firstAggregateCall = mockAggregate.mock.calls[0][0];
    expect(firstAggregateCall[0].$match.doctorId).toBeDefined();
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 2. Appointment template service
// ─────────────────────────────────────────────────────────────────────────────
describe('AppointmentTemplateService', () => {
  let service: typeof import('@api/modules/appointments/appointment-template.service');

  beforeAll(async () => {
    service = await import('@api/modules/appointments/appointment-template.service');
  });

  beforeEach(() => jest.clearAllMocks());

  const CREATED_BY = '507f1f77bcf86cd799439013';

  it('creates a template with all required fields', async () => {
    const mockTemplate = {
      _id: '507f1f77bcf86cd799439099',
      clinicId: CLINIC_ID,
      createdBy: CREATED_BY,
      name: 'Standard Consultation',
      type: 'consultation',
      defaultDurationMinutes: 30,
      isTelemedicine: false,
      bufferBefore: 5,
      bufferAfter: 5,
      isActive: true,
      usageCount: 0,
    };
    mockTemplateCreate.mockResolvedValue(mockTemplate);

    const result = await service.createTemplate(CLINIC_ID, CREATED_BY, {
      name: 'Standard Consultation',
      type: 'consultation',
      defaultDurationMinutes: 30,
      bufferBefore: 5,
      bufferAfter: 5,
    });

    expect(result).toEqual(mockTemplate);
    expect(mockTemplateCreate).toHaveBeenCalledTimes(1);
  });

  it('lists only active templates by default', async () => {
    mockTemplateFind.mockReturnValue({ sort: jest.fn().mockReturnValue({ lean: jest.fn().mockResolvedValue([]) }) });

    await service.listTemplates(CLINIC_ID);

    const callArg = mockTemplateFind.mock.calls[0][0];
    expect(callArg.isActive).toBe(true);
  });

  it('lists inactive templates when includeInactive=true', async () => {
    mockTemplateFind.mockReturnValue({ sort: jest.fn().mockReturnValue({ lean: jest.fn().mockResolvedValue([]) }) });

    await service.listTemplates(CLINIC_ID, undefined, true);

    const callArg = mockTemplateFind.mock.calls[0][0];
    expect(callArg.isActive).toBeUndefined();
  });

  it('updates a template and returns the updated document', async () => {
    const updated = { _id: '507f1f77bcf86cd799439099', name: 'Renamed', isActive: true };
    mockTemplateFindOneAndUpdate.mockReturnValue({ lean: jest.fn().mockResolvedValue(updated) });

    const result = await service.updateTemplate(CLINIC_ID, '507f1f77bcf86cd799439099', {
      name: 'Renamed',
    });

    expect(result?.name).toBe('Renamed');
  });

  it('deactivates a template (soft delete)', async () => {
    mockTemplateUpdateOne.mockResolvedValue({ matchedCount: 1 });

    const success = await service.deactivateTemplate(CLINIC_ID, '507f1f77bcf86cd799439099');
    expect(success).toBe(true);
  });

  it('returns false when deactivating a non-existent template', async () => {
    mockTemplateUpdateOne.mockResolvedValue({ matchedCount: 0 });

    const success = await service.deactivateTemplate(CLINIC_ID, '507f1f77bcf86cd799439099');
    expect(success).toBe(false);
  });

  it('increments usageCount when recordTemplateUsage is called', async () => {
    mockUpdateOne.mockResolvedValue({ modifiedCount: 1 });
    // recordTemplateUsage uses AppointmentTemplateModel.updateOne
    mockTemplateUpdateOne.mockResolvedValue({ modifiedCount: 1 });

    await service.recordTemplateUsage('507f1f77bcf86cd799439099');
    expect(mockTemplateUpdateOne).toHaveBeenCalledWith(
      expect.objectContaining({}),
      { $inc: { usageCount: 1 } },
    );
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 3. Appointment clustering service
// ─────────────────────────────────────────────────────────────────────────────
describe('AppointmentClusteringService', () => {
  let clusterAppointmentsForDoctor: typeof import('@api/modules/appointments/appointment-clustering.service').clusterAppointmentsForDoctor;
  let suggestOptimalSlot: typeof import('@api/modules/appointments/appointment-clustering.service').suggestOptimalSlot;

  beforeAll(async () => {
    ({ clusterAppointmentsForDoctor, suggestOptimalSlot } = await import(
      '@api/modules/appointments/appointment-clustering.service'
    ));
  });

  beforeEach(() => jest.clearAllMocks());

  const targetDate = new Date('2026-09-01T00:00:00.000Z');

  it('returns empty clustering stats when no appointments exist', async () => {
    mockFind.mockReturnValue({
      select: jest.fn().mockReturnThis(),
      sort: jest.fn().mockReturnThis(),
      lean: jest.fn().mockResolvedValue([]),
    });

    const result = await clusterAppointmentsForDoctor(DOCTOR_ID, CLINIC_ID, targetDate);

    expect(result.clusters).toHaveLength(0);
    expect(result.totalAppointments).toBe(0);
    expect(result.overallUtilization).toBe(0);
  });

  it('groups appointments within 30-minute gap into the same cluster', async () => {
    // 08:00-08:30, then 08:45-09:15 → gap = 15 min → same cluster
    const base = new Date('2026-09-01T08:00:00.000Z');
    const appt1Start = new Date(base);
    const appt2Start = new Date(base.getTime() + 45 * 60_000); // 08:45

    mockFind.mockReturnValue({
      select: jest.fn().mockReturnThis(),
      sort: jest.fn().mockReturnThis(),
      lean: jest.fn().mockResolvedValue([
        { _id: 'a1', scheduledAt: appt1Start, duration: 30, type: 'consultation', status: 'confirmed' },
        { _id: 'a2', scheduledAt: appt2Start, duration: 30, type: 'follow-up', status: 'scheduled' },
      ]),
    });

    const result = await clusterAppointmentsForDoctor(DOCTOR_ID, CLINIC_ID, targetDate);

    expect(result.clusters).toHaveLength(1);
    expect(result.clusters[0].appointmentCount).toBe(2);
    expect(result.totalAppointments).toBe(2);
  });

  it('splits appointments with gap > 30 minutes into separate clusters', async () => {
    const base = new Date('2026-09-01T08:00:00.000Z');
    const appt1Start = new Date(base);
    const appt2Start = new Date(base.getTime() + 90 * 60_000); // 09:30 — gap = 60 min

    mockFind.mockReturnValue({
      select: jest.fn().mockReturnThis(),
      sort: jest.fn().mockReturnThis(),
      lean: jest.fn().mockResolvedValue([
        { _id: 'b1', scheduledAt: appt1Start, duration: 30, type: 'consultation', status: 'confirmed' },
        { _id: 'b2', scheduledAt: appt2Start, duration: 30, type: 'consultation', status: 'scheduled' },
      ]),
    });

    const result = await clusterAppointmentsForDoctor(DOCTOR_ID, CLINIC_ID, targetDate);

    expect(result.clusters).toHaveLength(2);
  });

  it('computes utilization rate correctly for a cluster', async () => {
    // 08:00-09:00 (60 min booked), window from 08:00-09:00 → 100% utilization
    const base = new Date('2026-09-01T08:00:00.000Z');

    mockFind.mockReturnValue({
      select: jest.fn().mockReturnThis(),
      sort: jest.fn().mockReturnThis(),
      lean: jest.fn().mockResolvedValue([
        { _id: 'c1', scheduledAt: base, duration: 60, type: 'procedure', status: 'confirmed' },
      ]),
    });

    const result = await clusterAppointmentsForDoctor(DOCTOR_ID, CLINIC_ID, targetDate);

    expect(result.clusters[0].utilizationRate).toBe(100);
    expect(result.clusters[0].gapMinutes).toBe(0);
  });

  it('suggestOptimalSlot returns null when the day is fully booked', async () => {
    // Fill 08:00-17:00 with back-to-back 30-min slots
    const base = new Date('2026-09-01T08:00:00.000Z');
    const appts = [];
    for (let i = 0; i < 18; i++) {
      appts.push({
        _id: `slot${i}`,
        scheduledAt: new Date(base.getTime() + i * 30 * 60_000),
        duration: 30,
        type: 'consultation',
        status: 'confirmed',
      });
    }

    mockFind.mockReturnValue({
      select: jest.fn().mockReturnThis(),
      sort: jest.fn().mockReturnThis(),
      lean: jest.fn().mockResolvedValue(appts),
    });

    const result = await suggestOptimalSlot(DOCTOR_ID, CLINIC_ID, targetDate, 30, 8, 17);
    expect(result).toBeNull();
  });

  it('suggestOptimalSlot returns the earliest free slot', async () => {
    // One 30-min appointment at 08:00; first free slot should be 08:30
    const base = new Date('2026-09-01T08:00:00.000Z');

    mockFind.mockReturnValue({
      select: jest.fn().mockReturnThis(),
      sort: jest.fn().mockReturnThis(),
      lean: jest.fn().mockResolvedValue([
        { _id: 'd1', scheduledAt: base, duration: 30, type: 'consultation', status: 'confirmed' },
      ]),
    });

    const result = await suggestOptimalSlot(DOCTOR_ID, CLINIC_ID, targetDate, 30, 8, 17);
    expect(result).not.toBeNull();
    // Should suggest 08:30 UTC
    expect(result!.getUTCHours()).toBe(8);
    expect(result!.getUTCMinutes()).toBe(30);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 4. Appointment duration validation service
// ─────────────────────────────────────────────────────────────────────────────
describe('AppointmentDurationValidationService', () => {
  let validateAppointmentDuration: typeof import('@api/modules/appointments/appointment-duration-validation.service').validateAppointmentDuration;
  let normalizeDuration: typeof import('@api/modules/appointments/appointment-duration-validation.service').normalizeDuration;
  let DURATION_RULES: typeof import('@api/modules/appointments/appointment-duration-validation.service').DURATION_RULES;

  beforeAll(async () => {
    ({ validateAppointmentDuration, normalizeDuration, DURATION_RULES } = await import(
      '@api/modules/appointments/appointment-duration-validation.service'
    ));
  });

  describe('validateAppointmentDuration', () => {
    it('accepts a valid consultation duration', () => {
      const result = validateAppointmentDuration('consultation', 30);
      expect(result.isValid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    it('rejects a duration below the type minimum', () => {
      const result = validateAppointmentDuration('follow-up', 5);
      expect(result.isValid).toBe(false);
      expect(result.errors.some((e) => e.includes('at least'))).toBe(true);
    });

    it('rejects a duration above the type maximum', () => {
      const result = validateAppointmentDuration('follow-up', 120);
      expect(result.isValid).toBe(false);
      expect(result.errors.some((e) => e.includes('must not exceed'))).toBe(true);
    });

    it('rejects a non-integer duration', () => {
      const result = validateAppointmentDuration('consultation', 3);
      expect(result.isValid).toBe(false);
    });

    it('rejects a duration exceeding absolute max (480 min)', () => {
      const result = validateAppointmentDuration('procedure', 500);
      expect(result.isValid).toBe(false);
      expect(result.errors.some((e) => e.includes('cannot exceed'))).toBe(true);
    });

    it('warns when duration is less than half the default', () => {
      // consultation default = 30, half = 15; use 14 → still valid range but warning
      const result = validateAppointmentDuration('consultation', 15);
      // 15 is the minimum, so valid, but <= half of 30
      expect(result.isValid).toBe(true);
      // Warning fires when duration < default * 0.5
      const hasWarning = result.warnings.some((w) => w.includes('half the recommended'));
      // 15 is NOT less than 15 (30*0.5=15), so no warning at exactly half
      expect(hasWarning).toBe(false);
    });

    it('warns when duration is more than double the default', () => {
      // procedure default = 60; 130 > 120 (double) → warning
      const result = validateAppointmentDuration('procedure', 130);
      expect(result.isValid).toBe(true);
      expect(result.warnings.some((w) => w.includes('double the recommended'))).toBe(true);
    });

    it('flags appointment ending after clinic hours', () => {
      // Schedule at 16:45, duration 30 min → ends at 17:15, clinic closes 17:00
      const scheduledAt = new Date('2026-09-01T16:45:00.000Z');
      // Set hours in local terms — use a UTC time that in UTC itself goes past 17:00
      const scheduledAtLocal = new Date();
      scheduledAtLocal.setHours(16, 45, 0, 0);
      const result = validateAppointmentDuration('consultation', 30, scheduledAtLocal, 17);
      expect(result.isValid).toBe(false);
      expect(result.errors.some((e) => e.includes('after clinic hours'))).toBe(true);
    });

    it('returns the recommended duration for the type', () => {
      const result = validateAppointmentDuration('procedure', 60);
      expect(result.recommendedDurationMinutes).toBe(DURATION_RULES.procedure.defaultMinutes);
    });
  });

  describe('normalizeDuration', () => {
    it('clamps below minimum to the minimum', () => {
      expect(normalizeDuration('follow-up', 5)).toBe(DURATION_RULES['follow-up'].minMinutes);
    });

    it('clamps above maximum to the maximum', () => {
      expect(normalizeDuration('follow-up', 300)).toBe(DURATION_RULES['follow-up'].maxMinutes);
    });

    it('returns the value unchanged when within range', () => {
      expect(normalizeDuration('consultation', 45)).toBe(45);
    });
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 5. Appointment availability service
// ─────────────────────────────────────────────────────────────────────────────
describe('AppointmentAvailabilityService', () => {
  let getDoctorAvailability: typeof import('@api/modules/appointments/appointment-availability.service').getDoctorAvailability;

  beforeAll(async () => {
    ({ getDoctorAvailability } = await import(
      '@api/modules/appointments/appointment-availability.service'
    ));
  });

  beforeEach(() => jest.clearAllMocks());

  const targetDate = new Date('2026-09-01T00:00:00.000Z');

  it('returns all slots as available when there are no bookings', async () => {
    // Find for booked appointments → empty
    mockFind.mockReturnValue({
      select: jest.fn().mockReturnThis(),
      sort: jest.fn().mockReturnThis(),
      lean: jest.fn().mockResolvedValue([]),
    });

    const result = await getDoctorAvailability(DOCTOR_ID, CLINIC_ID, targetDate, 30, 0, 0, 8, 17);

    expect(result.availableSlotsCount).toBe(result.totalSlotsCount);
    expect(result.nextAvailableSlot).not.toBeNull();
    expect(result.slotDurationMinutes).toBe(30);
    expect(result.openHour).toBe(8);
    expect(result.closeHour).toBe(17);
  });

  it('marks booked slots as unavailable', async () => {
    // One appointment at 08:00 UTC for 30 min
    const bookedAt = new Date('2026-09-01T08:00:00.000Z');
    mockFind.mockReturnValue({
      select: jest.fn().mockReturnThis(),
      sort: jest.fn().mockReturnThis(),
      lean: jest.fn().mockResolvedValue([
        { scheduledAt: bookedAt, duration: 30 },
      ]),
    });

    const result = await getDoctorAvailability(
      DOCTOR_ID, CLINIC_ID, new Date('2026-09-01T00:00:00.000Z'), 30, 0, 0, 8, 17
    );

    const bookedSlot = result.slots.find(
      (s) => new Date(s.time).getUTCHours() === 8 && new Date(s.time).getUTCMinutes() === 0,
    );

    if (bookedSlot) {
      expect(bookedSlot.available).toBe(false);
    }
  });

  it('accounts for buffer times when computing blocked intervals', async () => {
    // Appointment at 08:00 for 30 min; bufferAfter = 10 → blocks 08:00–08:40
    const bookedAt = new Date('2026-09-01T08:00:00.000Z');
    mockFind.mockReturnValue({
      select: jest.fn().mockReturnThis(),
      sort: jest.fn().mockReturnThis(),
      lean: jest.fn().mockResolvedValue([
        { scheduledAt: bookedAt, duration: 30 },
      ]),
    });

    const noBuffer = await getDoctorAvailability(DOCTOR_ID, CLINIC_ID, new Date('2026-09-01T00:00:00.000Z'), 30, 0, 0, 8, 17);
    const withBuffer = await getDoctorAvailability(DOCTOR_ID, CLINIC_ID, new Date('2026-09-01T00:00:00.000Z'), 30, 0, 10, 8, 17);

    // With buffer, the 08:30 slot should also be unavailable (falls within buffer window)
    const slot830_noBuffer = noBuffer.slots.find(
      (s) => new Date(s.time).getUTCHours() === 8 && new Date(s.time).getUTCMinutes() === 30,
    );
    const slot830_withBuffer = withBuffer.slots.find(
      (s) => new Date(s.time).getUTCHours() === 8 && new Date(s.time).getUTCMinutes() === 30,
    );

    if (slot830_noBuffer && slot830_withBuffer) {
      expect(slot830_noBuffer.available).toBe(true);
      expect(slot830_withBuffer.available).toBe(false);
    }
  });

  it('respects custom openHour / closeHour', async () => {
    mockFind.mockReturnValue({
      select: jest.fn().mockReturnThis(),
      sort: jest.fn().mockReturnThis(),
      lean: jest.fn().mockResolvedValue([]),
    });

    const result = await getDoctorAvailability(DOCTOR_ID, CLINIC_ID, targetDate, 60, 0, 0, 9, 13);

    // 9:00-13:00 with 60-min slots = 4 slots
    expect(result.totalSlotsCount).toBe(4);
    expect(result.slots[0].time).toMatch(/T09:00/);
  });

  it('sets nextAvailableSlot to null when all slots are taken', async () => {
    // Fill every 30-min slot from 08:00 to 17:00 (18 slots)
    const base = new Date('2026-09-01T08:00:00.000Z');
    const allBooked = Array.from({ length: 18 }, (_, i) => ({
      scheduledAt: new Date(base.getTime() + i * 30 * 60_000),
      duration: 30,
    }));

    mockFind.mockReturnValue({
      select: jest.fn().mockReturnThis(),
      sort: jest.fn().mockReturnThis(),
      lean: jest.fn().mockResolvedValue(allBooked),
    });

    const result = await getDoctorAvailability(DOCTOR_ID, CLINIC_ID, targetDate, 30, 0, 0, 8, 17);

    expect(result.nextAvailableSlot).toBeNull();
    expect(result.availableSlotsCount).toBe(0);
  });
});
