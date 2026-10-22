import { Schema } from 'mongoose';

/**
 * Shared base schema with common audit and soft-delete fields.
 *
 * Fields:
 *  - clinicId  : the clinic that owns the document
 *  - isActive  : soft-delete flag (true = active, false = deleted)
 *  - createdBy : reference to the User who created the document (optional
 *                for models like User itself that are system-created)
 *
 * `createdAt` / `updatedAt` are handled by each model's `timestamps: true`
 * option rather than being baked into the base schema so that models retain
 * full control over their timestamp behaviour.
 */
export const baseSchema = new Schema(
  {
    clinicId: {
      type: Schema.Types.ObjectId,
      ref: 'Clinic',
      required: false,
      index: true,
    },
    isActive: {
      type: Boolean,
      default: true,
      index: true,
    },
    createdBy: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      required: false,
    },
  },
  { _id: false, timestamps: false },
);
