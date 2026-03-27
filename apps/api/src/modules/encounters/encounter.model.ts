import { Schema, model, models } from "mongoose";
import { sanitizeText } from "@api/utils/sanitize";

export interface Encounter {
  patientId: Schema.Types.ObjectId;
  clinicId: Schema.Types.ObjectId;
  chiefComplaint: string;
  notes?: string;
  treatmentPlan?: string;
}

const encounterSchema = new Schema<Encounter>(
  {
    patientId:      { type: Schema.Types.ObjectId, ref: "Patient", required: true, index: true },
    clinicId:       { type: Schema.Types.ObjectId, ref: "Clinic",  required: true, index: true },
    chiefComplaint: { type: String, required: true },
    notes:          { type: String },
    treatmentPlan:  { type: String },
  },
  { timestamps: true, versionKey: false }
);

const FREE_TEXT_FIELDS = ["chiefComplaint", "notes", "treatmentPlan"] as const;

encounterSchema.pre("save", function () {
  for (const field of FREE_TEXT_FIELDS) {
    const val = this[field];
    if (val) (this as Record<string, unknown>)[field] = sanitizeText(val);
  }
});

export const EncounterModel = models.Encounter || model<Encounter>("Encounter", encounterSchema);
