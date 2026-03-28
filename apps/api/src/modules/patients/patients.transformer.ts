import { Document } from 'mongoose';

export interface PatientResponse {
  id: string;
  systemId: string;
  firstName: string;
  lastName: string;
  dateOfBirth: string;
  sex: string;
  contactNumber?: string;
  address?: string;
  createdAt: string;
  updatedAt: string;
}

export function toPatientResponse(
  doc: Document & {
    systemId: string;
    firstName: string;
    lastName: string;
    dateOfBirth: Date | string;
    sex: string;
    contactNumber?: string;
    address?: string;
    createdAt?: Date | string;
    updatedAt?: Date | string;
  },
): PatientResponse {
  return {
    id: String(doc._id),
    systemId: doc.systemId,
    firstName: doc.firstName,
    lastName: doc.lastName,
    dateOfBirth: doc.dateOfBirth instanceof Date ? doc.dateOfBirth.toISOString() : doc.dateOfBirth,
    sex: doc.sex,
    contactNumber: doc.contactNumber,
    address: doc.address,
    createdAt: doc.createdAt instanceof Date ? doc.createdAt.toISOString() : (doc.createdAt ?? ''),
    updatedAt: doc.updatedAt instanceof Date ? doc.updatedAt.toISOString() : (doc.updatedAt ?? ''),
  };
}
