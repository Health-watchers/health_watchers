import { type FilterField } from './types';

export const PATIENT_FILTER_FIELDS: FilterField[] = [
  {
    id: 'systemId',
    label: 'Patient ID',
    type: 'string',
    help: 'Matches the internal system ID assigned at registration.',
  },
  {
    id: 'firstName',
    label: 'First name',
    type: 'string',
    help: "Filters by the patient's first name.",
  },
  {
    id: 'lastName',
    label: 'Last name',
    type: 'string',
    help: "Filters by the patient's last name.",
  },
  {
    id: 'sex',
    label: 'Sex',
    type: 'string',
    options: ['M', 'F', 'O'],
    help: 'Biological sex recorded on the patient record.',
  },
  {
    id: 'dateOfBirth',
    label: 'Date of birth',
    type: 'date',
    help: 'Supports before, after, equals and between operators.',
  },
  {
    id: 'contactNumber',
    label: 'Contact number',
    type: 'string',
    help: 'Partial phone number matching uses the "contains" operator.',
  },
  {
    id: 'address',
    label: 'Address',
    type: 'string',
    help: 'Free-text location search.',
  },
  {
    id: 'riskLevel',
    label: 'Risk level',
    type: 'string',
    options: ['low', 'medium', 'high', 'critical'],
    help: 'Clinical risk tier assigned by the risk engine.',
  },
  {
    id: 'riskScore',
    label: 'Risk score',
    type: 'number',
    help: 'Numeric risk score. Combine with "at least" or "at most".',
  },
  {
    id: 'isActive',
    label: 'Active',
    type: 'boolean',
    options: ['true', 'false'],
    help: 'Whether the patient record is currently active.',
  },
  {
    id: 'clinicId',
    label: 'Clinic',
    type: 'string',
    help: 'Internal clinic identifier.',
  },
  {
    id: 'createdAt',
    label: 'Registered on',
    type: 'date',
    help: 'Registration date. Use with "before"/"after" for recent registrations.',
  },
];

export function fieldById(id: string): FilterField | undefined {
  return PATIENT_FILTER_FIELDS.find((field) => field.id === id);
}
