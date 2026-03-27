import { Schema, model, models } from "mongoose";
import { encrypt, decrypt } from "@api/lib/encrypt";
import { sanitizeText } from "@api/utils/sanitize";

const PHI_FIELDS = ["contactNumber", "address", "dateOfBirth"] as const;

export interface Patient {
  systemId: string;
  firstName: string;
  lastName: string;
  dateOfBirth: string;
  sex: "M" | "F" | "O";
  contactNumber?: string;
  address?: string;
  clinicId: Schema.Types.ObjectId;
}

const patientSchema = new Schema<Patient>(
  {
    systemId:      { type: String, required: true, unique: true },
    firstName:     { type: String, required: true, trim: true },
    lastName:      { type: String, required: true, trim: true },
    dateOfBirth:   { type: String, required: true },   // stored encrypted
    sex:           { type: String, enum: ["M", "F", "O"], required: true },
    contactNumber: { type: String },                   // stored encrypted
    address:       { type: String },                   // stored encrypted
    clinicId:      { type: Schema.Types.ObjectId, ref: "Clinic", required: true, index: true },
  },
  { timestamps: true, versionKey: false }
);

// Sanitize free-text fields, then encrypt PHI before every save
patientSchema.pre("save", function () {
  if (this.address) this.address = sanitizeText(this.address);
  for (const field of PHI_FIELDS) {
    const val = this[field] as string | undefined;
    if (val) (this as Record<string, unknown>)[field] = encrypt(val);
  }
});

// Decrypt PHI after fetch (find / findOne / findById)
function decryptDoc(doc: Record<string, unknown> | null) {
  if (!doc) return;
  for (const field of PHI_FIELDS) {
    const val = doc[field] as string | undefined;
    if (val) doc[field] = decrypt(val);
  }
}

patientSchema.post("save", function () { decryptDoc(this as unknown as Record<string, unknown>); });
patientSchema.post("find", function (docs: Record<string, unknown>[]) { docs.forEach(decryptDoc); });
patientSchema.post("findOne", decryptDoc);
patientSchema.post("findOneAndUpdate", decryptDoc);

export const PatientModel = models.Patient || model<Patient>("Patient", patientSchema);
