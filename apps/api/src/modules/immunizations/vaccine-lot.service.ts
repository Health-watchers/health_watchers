/**
 * Vaccine lot tracking & supply chain (Issue #1246)
 *
 * Manages vaccine lot inventory per clinic: intake from suppliers, dose
 * administration/wastage, expiry and low-stock detection, and recalls.
 */
import { VaccineLotModel, IVaccineLot, VaccineLotStatus } from './vaccine-lot.model';

export interface CreateLotInput {
  clinicId: string;
  lotNumber: string;
  vaccineCode: string;
  vaccineName: string;
  manufacturer: string;
  supplier?: string;
  expiryDate: Date;
  quantityReceived: number;
  reorderThreshold?: number;
  notes?: string;
}

export interface AdjustLotInput {
  /** 'administered' decrements stock by doses given; 'wasted' by discarded doses. */
  kind: 'administered' | 'wasted';
  quantity: number;
}

export type LotStatusUpdate = Pick<IVaccineLot, 'status' | 'recalledReason' | 'recalledAt'>;

function httpError(statusCode: number, message: string): Error & { statusCode: number } {
  return Object.assign(new Error(message), { statusCode });
}

/** Remaining doses on hand for a lot document. */
export function quantityRemaining(
  lot: Pick<IVaccineLot, 'quantityReceived' | 'quantityAdministered' | 'quantityWasted'>
): number {
  return lot.quantityReceived - lot.quantityAdministered - lot.quantityWasted;
}

/** Derive the lot status from its stock/expiry state. */
export function deriveLotStatus(
  lot: Pick<
    IVaccineLot,
    | 'quantityReceived'
    | 'quantityAdministered'
    | 'quantityWasted'
    | 'expiryDate'
    | 'reorderThreshold'
    | 'status'
  >
): VaccineLotStatus {
  if (lot.status === 'recalled') return 'recalled';
  if (lot.expiryDate < new Date()) return 'expired';
  const remaining = quantityRemaining(lot);
  if (remaining <= 0) return 'depleted';
  if (remaining <= lot.reorderThreshold) return 'low';
  return 'active';
}

export async function createLot(input: CreateLotInput) {
  const existing = await VaccineLotModel.findOne({
    clinicId: input.clinicId,
    lotNumber: input.lotNumber,
  });
  if (existing) throw httpError(409, `Lot ${input.lotNumber} already exists for this clinic`);

  return VaccineLotModel.create({
    clinicId: input.clinicId,
    lotNumber: input.lotNumber,
    vaccineCode: input.vaccineCode,
    vaccineName: input.vaccineName,
    manufacturer: input.manufacturer,
    supplier: input.supplier,
    expiryDate: input.expiryDate,
    quantityReceived: input.quantityReceived,
    quantityAdministered: 0,
    quantityWasted: 0,
    reorderThreshold: input.reorderThreshold ?? 10,
    notes: input.notes,
    receivedAt: new Date(),
  });
}

/** Record additional stock intake from a supplier (supply chain replenishment). */
export async function receiveLotStock(lotId: string, clinicId: string, quantity: number) {
  if (!Number.isFinite(quantity) || quantity <= 0) {
    throw httpError(400, 'Quantity must be a positive number');
  }

  const lot = await VaccineLotModel.findOne({ _id: lotId, clinicId });
  if (!lot) throw httpError(404, 'Lot not found');
  if (lot.status === 'recalled') throw httpError(400, 'Cannot add stock to a recalled lot');

  lot.quantityReceived += quantity;
  lot.status = deriveLotStatus(lot);
  return lot.save();
}

/** Decrement lot stock for administered or wasted doses. */
export async function adjustLotStock(lotId: string, clinicId: string, input: AdjustLotInput) {
  if (!Number.isInteger(input.quantity) || input.quantity <= 0) {
    throw httpError(400, 'Quantity must be a positive integer');
  }

  const lot = await VaccineLotModel.findOne({ _id: lotId, clinicId });
  if (!lot) throw httpError(404, 'Lot not found');
  if (lot.status === 'recalled') throw httpError(400, 'Cannot adjust a recalled lot');

  const remaining = quantityRemaining(lot);
  if (input.quantity > remaining) {
    throw httpError(400, `Adjustment exceeds remaining stock (${remaining} doses left)`);
  }

  if (input.kind === 'administered') lot.quantityAdministered += input.quantity;
  else lot.quantityWasted += input.quantity;

  lot.status = deriveLotStatus(lot);
  return lot.save();
}

/** Mark a lot as recalled. */
export async function recallLot(
  lotId: string,
  clinicId: string,
  reason: string
): Promise<IVaccineLot> {
  const lot = await VaccineLotModel.findOne({ _id: lotId, clinicId });
  if (!lot) throw httpError(404, 'Lot not found');

  lot.status = 'recalled';
  lot.recalledReason = reason;
  lot.recalledAt = new Date();
  return lot.save();
}

/** List lots for a clinic with optional filters. */
export async function listLots(
  clinicId: string,
  options: { vaccineCode?: string; status?: string; limit?: number } = {}
) {
  const filter: Record<string, unknown> = { clinicId };
  if (options.vaccineCode) filter.vaccineCode = options.vaccineCode;
  if (options.status) filter.status = options.status;

  const lots = await VaccineLotModel.find(filter)
    .sort({ expiryDate: 1 })
    .limit(options.limit ?? 100)
    .lean();

  return lots.map((lot) => ({ ...lot, quantityRemaining: quantityRemaining(lot) }));
}

/** Find a single lot. */
export async function getLot(lotId: string, clinicId: string) {
  const lot = await VaccineLotModel.findOne({ _id: lotId, clinicId }).lean();
  if (!lot) throw httpError(404, 'Lot not found');
  return { ...lot, quantityRemaining: quantityRemaining(lot) };
}

/**
 * Decrement a lot after a dose is administered. Used by the immunization
 * create flow; silently no-ops when the lot is not tracked.
 */
export async function recordDoseAdministered(
  clinicId: string,
  lotNumber: string,
  quantity = 1
): Promise<void> {
  const lot = await VaccineLotModel.findOne({ clinicId, lotNumber });
  if (!lot) return;
  if (lot.status === 'recalled') return;
  const remaining = quantityRemaining(lot);
  if (remaining <= 0) return;

  lot.quantityAdministered += quantity;
  lot.status = deriveLotStatus(lot);
  await lot.save();
}

/** Recompute status for lots that may have expired or run low (maintenance). */
export async function refreshLotStatuses(clinicId?: string): Promise<number> {
  const filter: Record<string, unknown> = { status: { $ne: 'recalled' } };
  if (clinicId) filter.clinicId = clinicId;

  const lots = await VaccineLotModel.find(filter);
  let updated = 0;
  for (const lot of lots) {
    const next = deriveLotStatus(lot);
    if (next !== lot.status) {
      lot.status = next;
      await lot.save();
      updated += 1;
    }
  }
  return updated;
}
