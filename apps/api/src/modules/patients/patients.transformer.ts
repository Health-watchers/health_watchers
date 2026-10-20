import type { Patient as SharedPatient } from '@health-watchers/types';
import { isRecord } from '@health-watchers/types';

export interface PatientResponse extends Pick<
  SharedPatient,
  'systemId' | 'firstName' | 'lastName' | 'dateOfBirth'
> {
  _id: string;
  id: string;
  sex: SharedPatient['sex'];
  contactNumber?: string;
  address?: string;
  allergies: unknown[];
  insurance: unknown[];
  createdAt: string;
  updatedAt: string;
  photoUrl?: string;
  thumbnailUrl?: string;
  age?: number | null;
  ageGroup?: string | null;
}

function asString(value: unknown, fallback = ''): string {
  return typeof value === 'string' ? value : fallback;
}

function asOptionalString(value: unknown): string | undefined {
  return typeof value === 'string' ? value : undefined;
}

function asIsoString(value: unknown): string {
  if (value instanceof Date) return value.toISOString();
  return asString(value);
}

export function toPatientResponse(doc: unknown): PatientResponse {
  const source = isRecord(doc) ? doc : {};
  const id = String(source._id ?? source.id ?? '');
  const sex = source.sex === 'M' || source.sex === 'F' || source.sex === 'O' ? source.sex : 'O';

  return {
    _id: id,
    id,
    systemId: asString(source.systemId),
    firstName: asString(source.firstName),
    lastName: asString(source.lastName),
    dateOfBirth: asIsoString(source.dateOfBirth),
    sex,
    contactNumber: asOptionalString(source.contactNumber),
    address: asOptionalString(source.address),
    allergies: Array.isArray(source.allergies) ? source.allergies : [],
    insurance: Array.isArray(source.insurance) ? source.insurance : [],
    createdAt: asIsoString(source.createdAt),
    updatedAt: asIsoString(source.updatedAt),
    photoUrl: asOptionalString(source.photoUrl),
    thumbnailUrl: asOptionalString(source.thumbnailUrl),
    age: typeof source.age === 'number' ? source.age : null,
    ageGroup: asOptionalString(source.ageGroup) ?? null,
  };
}
