import { Model, Document } from 'mongoose';

export interface LazyLoadOptions {
  fields?: string[];
  excludeFields?: string[];
  limit?: number;
  skip?: number;
}

export interface LazyLoadField {
  path: string;
  model: string;
  select?: string;
}

export class LazyLoader {
  private lazyLoadingConfig = new Map<string, LazyLoadField[]>();

  registerLazyFields(collectionName: string, fields: LazyLoadField[]) {
    this.lazyLoadingConfig.set(collectionName, fields);
  }

  getLazyFields(collectionName: string): LazyLoadField[] {
    return this.lazyLoadingConfig.get(collectionName) || [];
  }

  getBaseProjection(collectionName: string, options?: LazyLoadOptions) {
    const lazyFields = this.getLazyFields(collectionName);
    const fieldsToExclude = lazyFields.map((f) => f.path);

    const projection: Record<string, number> = { __v: 0 };

    if (options?.excludeFields) {
      options.excludeFields.forEach((field) => {
        projection[field] = 0;
      });
    }

    if (options?.fields) {
      const selectedFields = options.fields;
      Object.keys(projection).forEach((key) => {
        if (!selectedFields.includes(key)) {
          delete projection[key];
        }
      });
      selectedFields.forEach((field) => {
        if (!fieldsToExclude.includes(field)) {
          projection[field] = 1;
        }
      });
    } else {
      fieldsToExclude.forEach((field) => {
        projection[field] = 0;
      });
    }

    return projection;
  }

  createLazyReference(fieldPath: string, documentId: string, model: string) {
    return {
      __lazyLoad: true,
      path: fieldPath,
      id: documentId,
      model,
      loadedAt: null as Date | null,
    };
  }

  async loadLazyField<T extends Document>(
    document: T,
    fieldPath: string,
    model: Model<any>,
    options?: LazyLoadOptions
  ) {
    const fieldValue = (document as any)[fieldPath];

    if (!fieldValue) {
      return null;
    }

    if (Array.isArray(fieldValue)) {
      let ids = fieldValue;
      if (options?.limit) {
        ids = ids.slice(options.skip || 0, (options.skip || 0) + options.limit);
      }
      return await model.find({ _id: { $in: ids } }).lean();
    }

    return await model.findById(fieldValue).lean();
  }

  async loadMultipleLazyFields<T extends Document>(
    document: T,
    fieldPaths: string[],
    models: Map<string, Model<any>>,
    options?: LazyLoadOptions
  ) {
    const results: Record<string, any> = {};

    for (const fieldPath of fieldPaths) {
      const model = models.get(fieldPath);
      if (model) {
        results[fieldPath] = await this.loadLazyField(document, fieldPath, model, options);
      }
    }

    return results;
  }

  shouldLazyLoad(fieldPath: string, query: Record<string, any>): boolean {
    if (query.lazyLoad === false || query.populate === true) {
      return false;
    }

    if (Array.isArray(query.fields) && query.fields.includes(fieldPath)) {
      return false;
    }

    return true;
  }
}

export const lazyLoader = new LazyLoader();
