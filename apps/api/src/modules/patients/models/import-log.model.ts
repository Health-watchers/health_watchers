import { Schema, model, models } from 'mongoose';

export interface IImportError {
  row: number;
  field: string;
  error: string;
}

export interface IImportLog {
  clinicId: Schema.Types.ObjectId;
  importedBy: Schema.Types.ObjectId;
  importDate: Date;
  totalRows: number;
  importedCount: number;
  skippedCount: number;
  errorCount: number;
  fileName: string;
  errors: IImportError[];
}

const importLogSchema = new Schema<IImportLog>(
  {
    clinicId:      { type: Schema.Types.ObjectId, ref: 'Clinic', required: true, index: true },
    importedBy:    { type: Schema.Types.ObjectId, ref: 'User', required: true },
    importDate:    { type: Date, default: () => new Date() },
    totalRows:     { type: Number, required: true },
    importedCount: { type: Number, required: true },
    skippedCount:  { type: Number, required: true },
    errorCount:    { type: Number, required: true },
    fileName:      { type: String, required: true },
    errors:        { type: [{ row: Number, field: String, error: String }], default: [] },
  },
  { timestamps: false, versionKey: false }
);

export const ImportLogModel = models.ImportLog || model<IImportLog>('ImportLog', importLogSchema);
