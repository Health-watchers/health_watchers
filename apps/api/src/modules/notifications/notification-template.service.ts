import { Types } from 'mongoose';
import logger from '@api/utils/logger';
import {
  NotificationTemplateModel,
  INotificationTemplate,
  NotificationChannel,
  TemplateLocale,
  TEMPLATE_LOCALES,
} from './notification-template.model';

export interface RenderedTemplate {
  subject?: string;
  body: string;
  templateId?: string;
  version?: number;
  /** Placeholders that had no matching value and were left blank. */
  missingVariables: string[];
}

const PLACEHOLDER = /\{\{\s*([\w.]+)\s*\}\}/g;

/** Resolve a dotted path (`patient.firstName`) against the variable bag. */
function lookup(vars: Record<string, unknown>, path: string): unknown {
  return path.split('.').reduce<unknown>((acc, key) => {
    if (acc && typeof acc === 'object' && Object.prototype.hasOwnProperty.call(acc, key)) {
      // eslint-disable-next-line security/detect-object-injection -- read-only own-property lookup, guarded by hasOwnProperty
      return (acc as Record<string, unknown>)[key];
    }
    return undefined;
  }, vars);
}

/**
 * Interpolate `{{var}}` placeholders. Unknown placeholders are replaced with an
 * empty string and reported in `missingVariables` so callers can decide whether
 * to treat a partially-rendered message as an error.
 */
export function interpolate(
  template: string,
  vars: Record<string, unknown>
): { text: string; missingVariables: string[] } {
  const missing = new Set<string>();
  const text = template.replace(PLACEHOLDER, (_match, path: string) => {
    const value = lookup(vars, path);
    if (value === undefined || value === null) {
      missing.add(path);
      return '';
    }
    return String(value);
  });
  return { text, missingVariables: [...missing] };
}

function normaliseLocale(locale?: string): TemplateLocale {
  const lower = (locale ?? 'en').toLowerCase();
  return (TEMPLATE_LOCALES as readonly string[]).includes(lower) ? (lower as TemplateLocale) : 'en';
}

export interface FindTemplateQuery {
  key: string;
  channel: NotificationChannel;
  locale?: string;
  clinicId?: string | Types.ObjectId;
}

/**
 * Resolve the most specific active template:
 *   1. clinic override in the requested locale
 *   2. clinic override in `en`
 *   3. global template in the requested locale
 *   4. global template in `en`
 */
export async function findTemplate(
  query: FindTemplateQuery
): Promise<INotificationTemplate | null> {
  const locale = normaliseLocale(query.locale);
  const clinicId = query.clinicId ? new Types.ObjectId(query.clinicId) : null;

  const candidates: Array<{ clinicId: Types.ObjectId | null; locale: TemplateLocale }> = [];
  if (clinicId) {
    candidates.push({ clinicId, locale });
    if (locale !== 'en') candidates.push({ clinicId, locale: 'en' });
  }
  candidates.push({ clinicId: null, locale });
  if (locale !== 'en') candidates.push({ clinicId: null, locale: 'en' });

  for (const candidate of candidates) {
    const template = await NotificationTemplateModel.findOne({
      key: query.key,
      channel: query.channel,
      isActive: true,
      clinicId: candidate.clinicId,
      locale: candidate.locale,
    }).lean<INotificationTemplate>();
    if (template) return template;
  }
  return null;
}

export interface RenderTemplateInput extends FindTemplateQuery {
  variables?: Record<string, unknown>;
  /** Fallback used when no stored template matches. */
  fallback?: { subject?: string; body: string };
}

/**
 * Render a template for a single channel. Falls back to `input.fallback` when no
 * stored template is found so that callers always get a deliverable message.
 */
export async function renderTemplate(input: RenderTemplateInput): Promise<RenderedTemplate> {
  const vars = input.variables ?? {};
  const template = await findTemplate(input);

  if (!template) {
    if (!input.fallback) {
      throw new Error(
        `No notification template for key="${input.key}" channel="${input.channel}" and no fallback provided`
      );
    }
    const body = interpolate(input.fallback.body, vars);
    const subject = input.fallback.subject ? interpolate(input.fallback.subject, vars) : undefined;
    return {
      subject: subject?.text,
      body: body.text,
      missingVariables: [
        ...new Set([...body.missingVariables, ...(subject?.missingVariables ?? [])]),
      ],
    };
  }

  const body = interpolate(template.body, vars);
  const subject = template.subject ? interpolate(template.subject, vars) : undefined;
  const missing = [...new Set([...body.missingVariables, ...(subject?.missingVariables ?? [])])];

  if (missing.length > 0) {
    logger.warn(
      { key: input.key, channel: input.channel, missing },
      '[notification-template] rendered with missing variables'
    );
  }

  return {
    subject: subject?.text,
    body: body.text,
    templateId: String(template._id),
    version: template.version,
    missingVariables: missing,
  };
}

export interface UpsertTemplateInput {
  clinicId?: string | Types.ObjectId | null;
  key: string;
  channel: NotificationChannel;
  locale?: string;
  subject?: string;
  body: string;
  description?: string;
  isActive?: boolean;
  createdBy?: string | Types.ObjectId;
}

/** Create or replace a template, bumping `version` on every change. */
export async function upsertTemplate(input: UpsertTemplateInput): Promise<INotificationTemplate> {
  const clinicId =
    input.clinicId === undefined || input.clinicId === null
      ? null
      : new Types.ObjectId(input.clinicId);
  const locale = normaliseLocale(input.locale);

  const existing = await NotificationTemplateModel.findOne({
    clinicId,
    key: input.key,
    channel: input.channel,
    locale,
  });

  if (existing) {
    existing.subject = input.subject;
    existing.body = input.body;
    existing.description = input.description;
    existing.isActive = input.isActive ?? existing.isActive;
    existing.version += 1;
    await existing.save();
    return existing.toObject();
  }

  const created = await NotificationTemplateModel.create({
    clinicId,
    key: input.key,
    channel: input.channel,
    locale,
    subject: input.subject,
    body: input.body,
    description: input.description,
    isActive: input.isActive ?? true,
    version: 1,
    createdBy: input.createdBy ? new Types.ObjectId(input.createdBy) : undefined,
  });
  return created.toObject();
}
