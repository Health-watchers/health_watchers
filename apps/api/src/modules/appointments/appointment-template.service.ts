import { Types } from 'mongoose';
import { AppointmentTemplateModel, IAppointmentTemplate } from './appointment-template.model';

export interface CreateTemplateDto {
  name: string;
  description?: string;
  type: 'consultation' | 'follow-up' | 'procedure' | 'emergency';
  defaultDurationMinutes: number;
  isTelemedicine?: boolean;
  instructions?: string;
  internalNotes?: string;
  bufferBefore?: number;
  bufferAfter?: number;
}

export interface UpdateTemplateDto extends Partial<CreateTemplateDto> {
  isActive?: boolean;
}

/**
 * Create a new appointment template for a clinic.
 */
export async function createTemplate(
  clinicId: string,
  createdBy: string,
  dto: CreateTemplateDto,
): Promise<IAppointmentTemplate> {
  const template = await AppointmentTemplateModel.create({
    clinicId: new Types.ObjectId(clinicId),
    createdBy: new Types.ObjectId(createdBy),
    name: dto.name,
    description: dto.description,
    type: dto.type,
    defaultDurationMinutes: dto.defaultDurationMinutes,
    isTelemedicine: dto.isTelemedicine ?? false,
    instructions: dto.instructions,
    internalNotes: dto.internalNotes,
    bufferBefore: dto.bufferBefore ?? 0,
    bufferAfter: dto.bufferAfter ?? 0,
  });
  return template;
}

/**
 * List all active templates for a clinic, optionally filtered by type.
 */
export async function listTemplates(
  clinicId: string,
  type?: string,
  includeInactive = false,
): Promise<IAppointmentTemplate[]> {
  const filter: Record<string, unknown> = {
    clinicId: new Types.ObjectId(clinicId),
  };
  if (!includeInactive) filter.isActive = true;
  if (type) filter.type = type;

  return AppointmentTemplateModel.find(filter).sort({ name: 1 }).lean();
}

/**
 * Get a single template by id (scoped to clinic).
 */
export async function getTemplateById(
  clinicId: string,
  templateId: string,
): Promise<IAppointmentTemplate | null> {
  return AppointmentTemplateModel.findOne({
    _id: new Types.ObjectId(templateId),
    clinicId: new Types.ObjectId(clinicId),
  }).lean();
}

/**
 * Update an existing template.
 */
export async function updateTemplate(
  clinicId: string,
  templateId: string,
  dto: UpdateTemplateDto,
): Promise<IAppointmentTemplate | null> {
  const update: Record<string, unknown> = {};
  if (dto.name !== undefined) update.name = dto.name;
  if (dto.description !== undefined) update.description = dto.description;
  if (dto.type !== undefined) update.type = dto.type;
  if (dto.defaultDurationMinutes !== undefined)
    update.defaultDurationMinutes = dto.defaultDurationMinutes;
  if (dto.isTelemedicine !== undefined) update.isTelemedicine = dto.isTelemedicine;
  if (dto.instructions !== undefined) update.instructions = dto.instructions;
  if (dto.internalNotes !== undefined) update.internalNotes = dto.internalNotes;
  if (dto.bufferBefore !== undefined) update.bufferBefore = dto.bufferBefore;
  if (dto.bufferAfter !== undefined) update.bufferAfter = dto.bufferAfter;
  if (dto.isActive !== undefined) update.isActive = dto.isActive;

  return AppointmentTemplateModel.findOneAndUpdate(
    { _id: new Types.ObjectId(templateId), clinicId: new Types.ObjectId(clinicId) },
    { $set: update },
    { new: true, runValidators: true },
  ).lean();
}

/**
 * Soft-delete: deactivate a template.
 */
export async function deactivateTemplate(
  clinicId: string,
  templateId: string,
): Promise<boolean> {
  const result = await AppointmentTemplateModel.updateOne(
    { _id: new Types.ObjectId(templateId), clinicId: new Types.ObjectId(clinicId) },
    { $set: { isActive: false } },
  );
  return result.matchedCount > 0;
}

/**
 * Increment usageCount when a template is used to create an appointment.
 */
export async function recordTemplateUsage(templateId: string): Promise<void> {
  await AppointmentTemplateModel.updateOne(
    { _id: new Types.ObjectId(templateId) },
    { $inc: { usageCount: 1 } },
  );
}
