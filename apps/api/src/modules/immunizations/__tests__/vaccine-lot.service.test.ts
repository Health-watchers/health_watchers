import {
  createLot,
  receiveLotStock,
  adjustLotStock,
  recallLot,
  listLots,
  getLot,
  recordDoseAdministered,
  quantityRemaining,
  deriveLotStatus,
} from '../vaccine-lot.service';

jest.mock('../vaccine-lot.model', () => ({
  VaccineLotModel: {
    findOne: jest.fn(),
    create: jest.fn(),
    find: jest.fn(),
  },
}));

import { VaccineLotModel } from '../vaccine-lot.model';

const CLINIC_ID = '507f1f77bcf86cd799439011';
const LOT_ID = '507f1f77bcf86cd799439012';

function makeLot(overrides: Record<string, unknown> = {}) {
  return {
    _id: LOT_ID,
    clinicId: CLINIC_ID,
    lotNumber: 'LOT-ABC',
    vaccineCode: '03',
    vaccineName: 'MMR',
    manufacturer: 'Merck',
    expiryDate: new Date('2030-01-01'),
    quantityReceived: 100,
    quantityAdministered: 10,
    quantityWasted: 0,
    reorderThreshold: 10,
    status: 'active',
    save: jest.fn().mockImplementation(function (this: Record<string, unknown>) {
      return Promise.resolve(this);
    }),
    ...overrides,
  };
}

function mockFindOne(lot: unknown) {
  (VaccineLotModel.findOne as jest.Mock).mockResolvedValue(lot);
}

describe('quantityRemaining / deriveLotStatus', () => {
  it('computes remaining doses', () => {
    expect(
      quantityRemaining({ quantityReceived: 100, quantityAdministered: 30, quantityWasted: 5 })
    ).toBe(65);
  });

  it('derives depleted status at zero stock', () => {
    const status = deriveLotStatus({
      quantityReceived: 10,
      quantityAdministered: 10,
      quantityWasted: 0,
      expiryDate: new Date('2030-01-01'),
      reorderThreshold: 5,
      status: 'active',
    });
    expect(status).toBe('depleted');
  });

  it('derives low status at or below reorder threshold', () => {
    const status = deriveLotStatus({
      quantityReceived: 10,
      quantityAdministered: 7,
      quantityWasted: 0,
      expiryDate: new Date('2030-01-01'),
      reorderThreshold: 5,
      status: 'active',
    });
    expect(status).toBe('low');
  });

  it('derives expired status past expiry', () => {
    const status = deriveLotStatus({
      quantityReceived: 10,
      quantityAdministered: 0,
      quantityWasted: 0,
      expiryDate: new Date('2020-01-01'),
      reorderThreshold: 5,
      status: 'active',
    });
    expect(status).toBe('expired');
  });

  it('keeps recalled status', () => {
    const status = deriveLotStatus({
      quantityReceived: 10,
      quantityAdministered: 0,
      quantityWasted: 0,
      expiryDate: new Date('2030-01-01'),
      reorderThreshold: 5,
      status: 'recalled',
    });
    expect(status).toBe('recalled');
  });
});

describe('createLot', () => {
  beforeEach(() => jest.clearAllMocks());

  it('creates a lot with default reorder threshold', async () => {
    (VaccineLotModel.findOne as jest.Mock).mockResolvedValue(null);
    (VaccineLotModel.create as jest.Mock).mockResolvedValue({ _id: LOT_ID });

    await createLot({
      clinicId: CLINIC_ID,
      lotNumber: 'LOT-1',
      vaccineCode: '03',
      vaccineName: 'MMR',
      manufacturer: 'Merck',
      expiryDate: new Date('2030-01-01'),
      quantityReceived: 50,
    });

    expect(VaccineLotModel.create).toHaveBeenCalledWith(
      expect.objectContaining({
        lotNumber: 'LOT-1',
        reorderThreshold: 10,
        quantityAdministered: 0,
        quantityWasted: 0,
      })
    );
  });

  it('rejects duplicate lots', async () => {
    (VaccineLotModel.findOne as jest.Mock).mockResolvedValue(makeLot());

    await expect(
      createLot({
        clinicId: CLINIC_ID,
        lotNumber: 'LOT-ABC',
        vaccineCode: '03',
        vaccineName: 'MMR',
        manufacturer: 'Merck',
        expiryDate: new Date('2030-01-01'),
        quantityReceived: 50,
      })
    ).rejects.toMatchObject({ statusCode: 409 });
  });
});

describe('receiveLotStock', () => {
  it('adds stock received from the supplier', async () => {
    const lot = makeLot();
    mockFindOne(lot);

    const result = await receiveLotStock(LOT_ID, CLINIC_ID, 25);
    expect(result.quantityReceived).toBe(125);
  });

  it('rejects non-positive quantities', async () => {
    mockFindOne(makeLot());
    await expect(receiveLotStock(LOT_ID, CLINIC_ID, 0)).rejects.toMatchObject({ statusCode: 400 });
  });
});

describe('adjustLotStock', () => {
  it('decrements administered doses', async () => {
    const lot = makeLot();
    mockFindOne(lot);

    const result = await adjustLotStock(LOT_ID, CLINIC_ID, { kind: 'administered', quantity: 5 });
    expect(result.quantityAdministered).toBe(15);
  });

  it('decrements wasted doses', async () => {
    const lot = makeLot();
    mockFindOne(lot);

    const result = await adjustLotStock(LOT_ID, CLINIC_ID, { kind: 'wasted', quantity: 3 });
    expect(result.quantityWasted).toBe(3);
  });

  it('rejects adjustments exceeding remaining stock', async () => {
    const lot = makeLot({ quantityReceived: 10, quantityAdministered: 10 });
    mockFindOne(lot);

    await expect(
      adjustLotStock(LOT_ID, CLINIC_ID, { kind: 'administered', quantity: 1 })
    ).rejects.toMatchObject({ statusCode: 400 });
  });

  it('rejects adjustments on recalled lots', async () => {
    const lot = makeLot({ status: 'recalled' });
    mockFindOne(lot);

    await expect(
      adjustLotStock(LOT_ID, CLINIC_ID, { kind: 'wasted', quantity: 1 })
    ).rejects.toMatchObject({ statusCode: 400 });
  });
});

describe('recallLot', () => {
  it('marks the lot recalled with a reason', async () => {
    const lot = makeLot();
    mockFindOne(lot);

    const result = await recallLot(LOT_ID, CLINIC_ID, 'Temperature excursion');
    expect(result.status).toBe('recalled');
    expect(result.recalledReason).toBe('Temperature excursion');
    expect(result.recalledAt).toBeInstanceOf(Date);
  });
});

describe('listLots / getLot', () => {
  it('returns lots with computed remaining quantity', async () => {
    (VaccineLotModel.find as jest.Mock).mockReturnValue({
      sort: jest.fn().mockReturnValue({
        limit: jest.fn().mockReturnValue({
          lean: jest
            .fn()
            .mockResolvedValue([makeLot({ quantityReceived: 10, quantityAdministered: 4 })]),
        }),
      }),
    });

    const lots = await listLots(CLINIC_ID, {});
    expect(lots[0].quantityRemaining).toBe(6);
  });

  it('throws 404 when a lot is not found', async () => {
    (VaccineLotModel.findOne as jest.Mock).mockReturnValue({
      lean: jest.fn().mockResolvedValue(null),
    });
    await expect(getLot(LOT_ID, CLINIC_ID)).rejects.toMatchObject({ statusCode: 404 });
  });
});

describe('recordDoseAdministered', () => {
  it('decrements the lot after a dose is given', async () => {
    const lot = makeLot();
    mockFindOne(lot);

    await recordDoseAdministered(CLINIC_ID, 'LOT-ABC');
    expect(lot.quantityAdministered).toBe(11);
    expect(lot.save).toHaveBeenCalled();
  });

  it('no-ops when the lot is not tracked', async () => {
    mockFindOne(null);
    await expect(recordDoseAdministered(CLINIC_ID, 'LOT-UNKNOWN')).resolves.toBeUndefined();
  });
});
