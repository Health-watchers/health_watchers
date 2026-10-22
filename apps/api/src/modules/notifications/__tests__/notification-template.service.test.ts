jest.mock('@api/utils/logger', () => ({
  __esModule: true,
  default: { info: jest.fn(), warn: jest.fn(), error: jest.fn() },
}));

import { interpolate, renderTemplate } from '../notification-template.service';
import { NotificationTemplateModel } from '../notification-template.model';

jest.mock('../notification-template.model', () => ({
  NOTIFICATION_CHANNELS: ['in_app', 'email', 'sms', 'push'],
  TEMPLATE_LOCALES: ['en', 'fr'],
  NotificationTemplateModel: { findOne: jest.fn(), create: jest.fn() },
}));

const findOne = NotificationTemplateModel.findOne as jest.Mock;
const leanReturning = (value: unknown): { lean: jest.Mock } => ({
  lean: jest.fn().mockResolvedValue(value),
});

describe('interpolate', () => {
  it('replaces simple and dotted placeholders', () => {
    const result = interpolate('Hi {{name}}, visit {{ clinic.name }}', {
      name: 'Ada',
      clinic: { name: 'Downtown' },
    });
    expect(result.text).toBe('Hi Ada, visit Downtown');
    expect(result.missingVariables).toEqual([]);
  });

  it('blanks unknown placeholders and reports them once', () => {
    const result = interpolate('{{a}} {{b}} {{a}}', { a: 'x' });
    expect(result.text).toBe('x  x');
    expect(result.missingVariables).toEqual(['b']);
  });
});

describe('renderTemplate', () => {
  beforeEach(() => jest.clearAllMocks());

  it('renders a stored template and returns its id and version', async () => {
    findOne.mockReturnValueOnce(
      leanReturning({
        _id: 't1',
        subject: 'Reminder for {{patientName}}',
        body: 'See you on {{date}}',
        version: 3,
      })
    );

    const rendered = await renderTemplate({
      key: 'appointment_reminder',
      channel: 'email',
      variables: { patientName: 'Ada', date: 'Monday' },
    });

    expect(rendered.subject).toBe('Reminder for Ada');
    expect(rendered.body).toBe('See you on Monday');
    expect(rendered.templateId).toBe('t1');
    expect(rendered.version).toBe(3);
  });

  it('walks the locale/scope fallback chain before giving up', async () => {
    findOne.mockReturnValue(leanReturning(null));

    const rendered = await renderTemplate({
      key: 'appointment_reminder',
      channel: 'sms',
      locale: 'fr',
      clinicId: '507f1f77bcf86cd799439011',
      fallback: { body: 'Fallback {{x}}' },
    });

    // clinic+fr, clinic+en, global+fr, global+en
    expect(findOne).toHaveBeenCalledTimes(4);
    expect(rendered.body).toBe('Fallback ');
    expect(rendered.missingVariables).toEqual(['x']);
  });

  it('throws when no template matches and no fallback is provided', async () => {
    findOne.mockReturnValue(leanReturning(null));
    await expect(renderTemplate({ key: 'missing', channel: 'push' })).rejects.toThrow(
      /No notification template/
    );
  });
});
