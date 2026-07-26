import { EncounterTemplateModel } from './encounter-template.model';
import logger from '@api/utils/logger';

interface TemplateImportInput {
  templateId: string;
  clinicId: string;
  userId: string;
}

export class TemplateMarketplaceService {
  async publishTemplate(templateId: string, userId: string) {
    return EncounterTemplateModel.findByIdAndUpdate(
      templateId,
      {
        visibility: 'public',
        publishedAt: new Date(),
        publishedBy: userId,
      },
      { new: true }
    );
  }

  async importTemplate(input: TemplateImportInput) {
    const { templateId, clinicId, userId } = input;

    const original = await EncounterTemplateModel.findById(templateId);
    if (!original) throw new Error('Template not found');

    // Create a copy for the clinic
    const imported = await EncounterTemplateModel.create({
      clinicId,
      name: original.name,
      description: original.description,
      category: original.category,
      defaultChiefComplaint: original.defaultChiefComplaint,
      defaultVitalSigns: original.defaultVitalSigns,
      suggestedDiagnoses: original.suggestedDiagnoses,
      suggestedTests: original.suggestedTests,
      notes: original.notes,
      isActive: true,
      createdBy: userId,
      visibility: 'clinic',
      tags: original.tags,
    });

    // Increment import count on original
    await EncounterTemplateModel.findByIdAndUpdate(templateId, {
      $inc: { importCount: 1 },
    });

    logger.info(`Template ${templateId} imported to clinic ${clinicId}`);
    return imported;
  }

  async browseMarketplace(limit: number = 20, offset: number = 0, tags?: string[]) {
    const query: Record<string, unknown> = {
      visibility: 'public',
      isApproved: true,
    };

    if (tags && tags.length > 0) {
      query.tags = { $in: tags };
    }

    const templates = await EncounterTemplateModel.find(query)
      .sort({ rating: -1, importCount: -1 })
      .limit(limit)
      .skip(offset);

    const total = await EncounterTemplateModel.countDocuments(query);

    return { templates, total };
  }

  async searchMarketplace(query: string, tags?: string[], limit: number = 20, offset: number = 0) {
    const searchQuery: Record<string, unknown> = {
      visibility: 'public',
      isApproved: true,
      $or: [
        { name: { $regex: query, $options: 'i' } },
        { description: { $regex: query, $options: 'i' } },
        { category: { $regex: query, $options: 'i' } },
      ],
    };

    if (tags && tags.length > 0) {
      searchQuery.tags = { $in: tags };
    }

    const templates = await EncounterTemplateModel.find(searchQuery)
      .sort({ rating: -1, importCount: -1 })
      .limit(limit)
      .skip(offset);

    const total = await EncounterTemplateModel.countDocuments(searchQuery);

    return { templates, total };
  }

  async rateTemplate(templateId: string, rating: number) {
    if (rating < 1 || rating > 5) throw new Error('Rating must be between 1 and 5');

    return EncounterTemplateModel.findByIdAndUpdate(templateId, { rating }, { new: true });
  }

  async approveTemplate(templateId: string, userId: string) {
    return EncounterTemplateModel.findByIdAndUpdate(
      templateId,
      {
        isApproved: true,
        approvedBy: userId,
      },
      { new: true }
    );
  }

  async rejectTemplate(templateId: string) {
    return EncounterTemplateModel.findByIdAndUpdate(
      templateId,
      { isApproved: false },
      { new: true }
    );
  }

  async removeTemplate(templateId: string) {
    return EncounterTemplateModel.findByIdAndUpdate(
      templateId,
      { visibility: 'private', isApproved: false },
      { new: true }
    );
  }
}

export const templateMarketplaceService = new TemplateMarketplaceService();
