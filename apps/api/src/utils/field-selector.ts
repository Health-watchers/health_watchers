export interface FieldSelectionConfig {
  allowedFields: string[];
  defaultFields: string[];
  restrictedFields?: string[]; // Fields that require special permissions
}

export class FieldSelector {
  private fieldConfigs = new Map<string, FieldSelectionConfig>();

  registerFieldConfig(modelName: string, config: FieldSelectionConfig) {
    this.fieldConfigs.set(modelName, config);
  }

  getFieldConfig(modelName: string): FieldSelectionConfig | undefined {
    return this.fieldConfigs.get(modelName);
  }

  parseRequestedFields(fieldsParam: string | string[] | undefined): Set<string> {
    if (!fieldsParam) {
      return new Set();
    }

    const fieldsArray = Array.isArray(fieldsParam) ? fieldsParam : fieldsParam.split(',');

    return new Set(fieldsArray.map((f) => f.trim()).filter((f) => f.length > 0));
  }

  parseExcludedFields(excludeParam: string | string[] | undefined): Set<string> {
    return this.parseRequestedFields(excludeParam);
  }

  buildMongooseProjection(
    modelName: string,
    requestedFields?: string | string[],
    excludedFields?: string | string[],
    userRole?: string
  ): Record<string, number> {
    const config = this.fieldConfigs.get(modelName);

    if (!config) {
      return {};
    }

    const requested = this.parseRequestedFields(requestedFields);
    const excluded = this.parseExcludedFields(excludedFields);

    const fieldsToInclude = requested.size > 0 ? requested : new Set(config.defaultFields);

    const projection: Record<string, number> = {};

    for (const field of config.allowedFields) {
      if (excluded.has(field)) {
        projection[field] = 0;
      } else if (fieldsToInclude.has(field)) {
        projection[field] = 1;
      } else if (requested.size > 0) {
        projection[field] = 0;
      }
    }

    // Handle restricted fields
    if (config.restrictedFields) {
      for (const field of config.restrictedFields) {
        if (!this.hasPermissionForField(field, userRole)) {
          projection[field] = 0;
        }
      }
    }

    return Object.keys(projection).length > 0 ? projection : {};
  }

  buildGraphQLSelection(modelName: string, requestedFields?: string | string[]): string[] {
    const config = this.fieldConfigs.get(modelName);

    if (!config) {
      return [];
    }

    const requested = this.parseRequestedFields(requestedFields);

    if (requested.size === 0) {
      return config.defaultFields;
    }

    return Array.from(requested).filter((field) => config.allowedFields.includes(field));
  }

  validateRequestedFields(
    modelName: string,
    requestedFields: string | string[]
  ): { valid: boolean; invalidFields: string[] } {
    const config = this.fieldConfigs.get(modelName);

    if (!config) {
      return {
        valid: false,
        invalidFields: Array.isArray(requestedFields) ? requestedFields : [requestedFields],
      };
    }

    const requested = Array.isArray(requestedFields) ? requestedFields : requestedFields.split(',');

    const invalidFields = requested.filter((field) => !config.allowedFields.includes(field.trim()));

    return {
      valid: invalidFields.length === 0,
      invalidFields,
    };
  }

  getFieldSize(data: any, field: string): number {
    const value = data?.[field];

    if (value === null || value === undefined) {
      return 0;
    }

    if (typeof value === 'string') {
      return Buffer.byteLength(value, 'utf8');
    }

    if (typeof value === 'object') {
      return Buffer.byteLength(JSON.stringify(value), 'utf8');
    }

    return 0;
  }

  estimatePayloadSize(data: any, modelName: string, requestedFields?: string | string[]): number {
    const config = this.fieldConfigs.get(modelName);

    if (!config || !Array.isArray(data)) {
      return Buffer.byteLength(JSON.stringify(data), 'utf8');
    }

    const requested = this.parseRequestedFields(requestedFields);
    const fieldsToInclude = requested.size > 0 ? requested : new Set(config.defaultFields);

    let totalSize = 0;

    for (const record of data) {
      let recordSize = 0;

      for (const field of fieldsToInclude) {
        if (config.allowedFields.includes(field)) {
          recordSize += this.getFieldSize(record, field);
        }
      }

      totalSize += recordSize;
    }

    return totalSize;
  }

  getUnusedFields(data: any, modelName: string, requestedFields?: string | string[]): string[] {
    const config = this.fieldConfigs.get(modelName);

    if (!config) {
      return [];
    }

    const requested = this.parseRequestedFields(requestedFields);

    if (requested.size === 0) {
      return [];
    }

    const dataKeys = new Set(Object.keys(data));
    const unusedFields: string[] = [];

    for (const field of requested) {
      if (!dataKeys.has(field)) {
        unusedFields.push(field);
      }
    }

    return unusedFields;
  }

  private hasPermissionForField(field: string, userRole?: string): boolean {
    const restrictedToRole: Record<string, string[]> = {
      email: ['doctor', 'admin'],
      ssn: ['doctor', 'admin'],
      medicalHistory: ['doctor', 'admin'],
      allergies: ['doctor', 'patient'],
      medications: ['doctor', 'patient'],
    };

    if (!restrictedToRole[field]) {
      return true;
    }

    if (!userRole) {
      return false;
    }

    return restrictedToRole[field].includes(userRole);
  }
}

export const fieldSelector = new FieldSelector();
