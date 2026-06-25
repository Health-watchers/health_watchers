import { Schema, Types, model, models } from 'mongoose';

export interface IICD10Favorite {
  code: string;
  description: string;
  addedBy?: Types.ObjectId;
  addedAt: Date;
}

export interface IClinicICD10Favorites {
  clinicId: Types.ObjectId;
  codes: IICD10Favorite[];
}

const favoriteSchema = new Schema<IICD10Favorite>(
  {
    code: { type: String, required: true, uppercase: true, trim: true },
    description: { type: String, default: '' },
    addedBy: { type: Schema.Types.ObjectId, ref: 'User' },
    addedAt: { type: Date, default: Date.now },
  },
  { _id: false }
);

const clinicICD10FavoritesSchema = new Schema<IClinicICD10Favorites>(
  {
    clinicId: { type: Schema.Types.ObjectId, ref: 'Clinic', required: true, unique: true, index: true },
    codes: { type: [favoriteSchema], default: [] },
  },
  { timestamps: true, versionKey: false }
);

export const ClinicICD10FavoritesModel =
  models.ClinicICD10Favorites ||
  model<IClinicICD10Favorites>('ClinicICD10Favorites', clinicICD10FavoritesSchema);
