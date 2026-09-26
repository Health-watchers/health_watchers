/**
 * #1251 — Reporting & analytics engine: data-source registry.
 *
 * The custom query builder only ever operates on the collections and fields
 * declared here. Nothing that reaches the aggregation pipeline is taken
 * directly from client input — field names, operators and the collection are
 * all validated against this allow-list first. This keeps the "custom query"
 * feature from turning into an arbitrary-Mongo-query hole.
 */

import { PatientModel } from '../../patients/models/patient.model';
import { EncounterModel } from '../../encounters/encounter.model';
import { PaymentRecordModel } from '../../payments/models/payment-record.model';
import type { Model } from 'mongoose';

export type FieldType = 'string' | 'number' | 'date' | 'boolean' | 'enum';

export interface FieldDef {
  /** Path as stored in MongoDB. */
  path: string;
  type: FieldType;
  /** Allowed values when `type === 'enum'` — also used to validate filters. */
  values?: readonly string[];
  /** Whether the field may be used in a `groupBy`. */
  groupable?: boolean;
  /** Whether the field may be aggregated with a numeric metric (sum/avg/min/max). */
  measurable?: boolean;
  /** Human label surfaced to the report builder UI. */
  label: string;
}

export interface DataSourceDef {
  key: string;
  label: string;
  model: () => Model<any>;
  /** Every query is force-scoped by this tenant field. */
  tenantField: string;
  /** Field used for date-range filtering when the caller passes `from`/`to`. */
  dateField: string;
  fields: Record<string, FieldDef>;
}

const patients: DataSourceDef = {
  key: 'patients',
  label: 'Patients',
  model: () => PatientModel as unknown as Model<any>,
  tenantField: 'clinicId',
  dateField: 'createdAt',
  fields: {
    createdAt: { path: 'createdAt', type: 'date', groupable: true, label: 'Registered on' },
    sex: {
      path: 'sex',
      type: 'enum',
      values: ['M', 'F', 'O'],
      groupable: true,
      label: 'Sex',
    },
    isActive: { path: 'isActive', type: 'boolean', groupable: true, label: 'Active' },
    riskLevel: {
      path: 'riskLevel',
      type: 'enum',
      values: ['low', 'medium', 'high', 'critical'],
      groupable: true,
      label: 'Risk level',
    },
    riskScore: {
      path: 'riskScore',
      type: 'number',
      measurable: true,
      label: 'Risk score',
    },
  },
};

const encounters: DataSourceDef = {
  key: 'encounters',
  label: 'Encounters',
  model: () => EncounterModel as unknown as Model<any>,
  tenantField: 'clinicId',
  dateField: 'createdAt',
  fields: {
    createdAt: { path: 'createdAt', type: 'date', groupable: true, label: 'Created on' },
    status: {
      path: 'status',
      type: 'string',
      groupable: true,
      label: 'Status',
    },
    outcome: { path: 'outcome', type: 'string', groupable: true, label: 'Outcome' },
    attendingDoctorId: {
      path: 'attendingDoctorId',
      type: 'string',
      groupable: true,
      label: 'Attending doctor',
    },
    chiefComplaint: {
      path: 'chiefComplaint',
      type: 'string',
      groupable: true,
      label: 'Chief complaint',
    },
    followUpRequired: {
      path: 'followUpRequired',
      type: 'boolean',
      groupable: true,
      label: 'Follow-up required',
    },
  },
};

const payments: DataSourceDef = {
  key: 'payments',
  label: 'Payments',
  model: () => PaymentRecordModel as unknown as Model<any>,
  tenantField: 'clinicId',
  dateField: 'createdAt',
  fields: {
    createdAt: { path: 'createdAt', type: 'date', groupable: true, label: 'Created on' },
    status: {
      path: 'status',
      type: 'enum',
      values: ['pending', 'confirmed', 'failed', 'expired', 'refunded'],
      groupable: true,
      label: 'Status',
    },
    assetCode: { path: 'assetCode', type: 'string', groupable: true, label: 'Asset' },
    amount: { path: 'amount', type: 'number', measurable: true, label: 'Amount' },
  },
};

export const DATA_SOURCES: Record<string, DataSourceDef> = {
  patients,
  encounters,
  payments,
};

export function getDataSource(key: string): DataSourceDef | undefined {
  return Object.prototype.hasOwnProperty.call(DATA_SOURCES, key) ? DATA_SOURCES[key] : undefined;
}

/** Shape returned by `GET /reports/datasources` for the report-builder UI. */
export function describeDataSources() {
  return Object.values(DATA_SOURCES).map((ds) => ({
    key: ds.key,
    label: ds.label,
    dateField: ds.dateField,
    fields: Object.entries(ds.fields).map(([name, def]) => ({
      name,
      label: def.label,
      type: def.type,
      values: def.values ?? null,
      groupable: !!def.groupable,
      measurable: !!def.measurable,
    })),
  }));
}
