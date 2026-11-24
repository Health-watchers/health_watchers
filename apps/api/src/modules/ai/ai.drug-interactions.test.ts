import {
  extractJSON,
  checkDrugInteractions,
  classifySeverity,
  DRUG_INTERACTION_FALLBACK,
  DrugInteractionResult,
} from './ai.service';

// ── extractJSON unit tests ────────────────────────────────────────────────────

describe('extractJSON', () => {
  it('returns plain JSON unchanged', () => {
    const input = '{"foo":"bar"}';
    expect(extractJSON(input)).toBe('{"foo":"bar"}');
  });

  it('strips ```json ... ``` markdown fences', () => {
    const input = '```json\n{"foo":"bar"}\n```';
    expect(extractJSON(input)).toBe('{"foo":"bar"}');
  });

  it('strips ``` ... ``` markdown fences without language tag', () => {
    const input = '```\n{"foo":"bar"}\n```';
    expect(extractJSON(input)).toBe('{"foo":"bar"}');
  });

  it('extracts JSON from extra explanation text before the object', () => {
    const input = 'Here is the result:\n{"foo":"bar"}\nEnd of response.';
    expect(JSON.parse(extractJSON(input))).toEqual({ foo: 'bar' });
  });

  it('extracts JSON when there is trailing explanation text', () => {
    const input = '{"foo":"bar"} Please note this is for clinical use only.';
    expect(JSON.parse(extractJSON(input))).toEqual({ foo: 'bar' });
  });

  it('returns trimmed empty string for empty input', () => {
    expect(extractJSON('')).toBe('');
  });

  it('returns trimmed text when no JSON object found', () => {
    const input = '  no json here  ';
    expect(extractJSON(input)).toBe('no json here');
  });

  it('handles nested JSON objects correctly', () => {
    const input = '{"outer":{"inner":"value"},"arr":[1,2]}';
    const result = JSON.parse(extractJSON(input));
    expect(result.outer.inner).toBe('value');
    expect(result.arr).toEqual([1, 2]);
  });
});

// ── checkDrugInteractions integration tests ───────────────────────────────────

jest.mock('@google/generative-ai');
jest.mock('../../utils/logger', () => ({
  __esModule: true,
  default: { debug: jest.fn(), info: jest.fn(), warn: jest.fn(), error: jest.fn() },
}));

const mockCacheGet = jest.fn();
const mockCacheSet = jest.fn();
jest.mock('../../services/cache.service', () => ({
  __esModule: true,
  cacheService: {
    get: (...args: any[]) => mockCacheGet(...args),
    set: (...args: any[]) => mockCacheSet(...args),
  },
}));

const mockEmitCdsAlert = jest.fn();
jest.mock('../../services/cds.service', () => ({
  __esModule: true,
  emitCdsAlert: (...args: any[]) => mockEmitCdsAlert(...args),
}));

import { GoogleGenerativeAI } from '@google/generative-ai';

const mockGenerateContent = jest.fn();
const mockGetGenerativeModel = jest.fn(() => ({ generateContent: mockGenerateContent }));

(GoogleGenerativeAI as jest.MockedClass<typeof GoogleGenerativeAI>).mockImplementation(
  () =>
    ({
      getGenerativeModel: mockGetGenerativeModel,
    }) as any
);

// Reset module-level client singleton between tests
beforeEach(() => {
  jest.clearAllMocks();
  mockCacheGet.mockResolvedValue(null);
  mockCacheSet.mockResolvedValue(undefined);
  // Force re-creation of singleton by resetting module
  jest.resetModules();
});

const validResponse: DrugInteractionResult = {
  interactions: [
    {
      drug1: 'Warfarin',
      drug2: 'Aspirin',
      severity: 'major',
      description: 'Increased bleeding risk',
      recommendation: 'Monitor INR closely',
    },
  ],
  severity: 'major',
  summary: 'Major interaction found between Warfarin and Aspirin.',
  disclaimer: '',
};

describe('checkDrugInteractions', () => {
  it('parses a valid plain JSON response', async () => {
    mockGenerateContent.mockResolvedValue({
      response: {
        text: () =>
          JSON.stringify({
            interactions: validResponse.interactions,
            severity: validResponse.severity,
            summary: validResponse.summary,
          }),
      },
    });

    const { checkDrugInteractions: check } = await import('./ai.service');
    const result = await check(['Warfarin', 'Aspirin']);

    expect(result.severity).toBe('major');
    expect(result.interactions).toHaveLength(1);
    expect(result.disclaimer).toBeTruthy();
  });

  it('parses a markdown-wrapped JSON response', async () => {
    const payload = {
      interactions: validResponse.interactions,
      severity: 'major',
      summary: 'Major interaction.',
    };
    mockGenerateContent.mockResolvedValue({
      response: { text: () => '```json\n' + JSON.stringify(payload) + '\n```' },
    });

    const { checkDrugInteractions: check } = await import('./ai.service');
    const result = await check(['Warfarin', 'Aspirin']);

    expect(result.severity).toBe('major');
  });

  it('retries with stricter prompt on first parse failure and succeeds', async () => {
    const validPayload = JSON.stringify({
      interactions: [],
      severity: 'none',
      summary: 'No interactions found.',
    });
    mockGenerateContent
      .mockResolvedValueOnce({
        response: { text: () => 'Sorry, I cannot provide that information.' },
      })
      .mockResolvedValueOnce({ response: { text: () => validPayload } });

    const { checkDrugInteractions: check } = await import('./ai.service');
    const result = await check(['Aspirin', 'Ibuprofen']);

    expect(mockGenerateContent).toHaveBeenCalledTimes(2);
    expect(result.severity).toBe('none');
  });

  it('returns safe fallback when all retries fail', async () => {
    mockGenerateContent.mockResolvedValue({
      response: { text: () => 'I am unable to process this request.' },
    });

    const { checkDrugInteractions: check, DRUG_INTERACTION_FALLBACK: fallback } =
      await import('./ai.service');
    const result = await check(['DrugA', 'DrugB']);

    expect(result.severity).toBe('none');
    expect(result.interactions).toEqual([]);
    expect(result.summary).toBe(fallback.summary);
  });

  it('returns safe fallback when Gemini throws an error', async () => {
    mockGenerateContent.mockRejectedValue(new Error('Network error'));

    const { checkDrugInteractions: check, DRUG_INTERACTION_FALLBACK: fallback } =
      await import('./ai.service');
    const result = await check(['DrugA', 'DrugB']);

    expect(result.severity).toBe('none');
    expect(result.summary).toBe(fallback.summary);
  });

  it('never includes raw LLM output in returned error messages', async () => {
    const sensitiveText = 'PATIENT_DATA: John Doe, SSN 123-45-6789 has interaction';
    mockGenerateContent.mockResolvedValue({
      response: { text: () => sensitiveText },
    });

    const { checkDrugInteractions: check } = await import('./ai.service');
    const result = await check(['DrugA', 'DrugB']);

    expect(JSON.stringify(result)).not.toContain('PATIENT_DATA');
    expect(JSON.stringify(result)).not.toContain('123-45-6789');
  });
});

// ── classifySeverity unit tests ───────────────────────────────────────────────

describe('classifySeverity', () => {
  it('maps "mild" to mild', () => {
    expect(classifySeverity('mild')).toBe('mild');
  });

  it('maps "moderate" to moderate', () => {
    expect(classifySeverity('moderate')).toBe('moderate');
  });

  it('maps "severe" to severe', () => {
    expect(classifySeverity('severe')).toBe('severe');
  });

  it('maps "contraindicated" to contraindicated', () => {
    expect(classifySeverity('contraindicated')).toBe('contraindicated');
  });

  it('maps legacy "major" to severe', () => {
    expect(classifySeverity('major')).toBe('severe');
  });

  it('maps legacy "minor" to mild', () => {
    expect(classifySeverity('minor')).toBe('mild');
  });

  it('maps "none" to none', () => {
    expect(classifySeverity('none')).toBe('none');
  });

  it('is case-insensitive and trims whitespace', () => {
    expect(classifySeverity('  SEVERE ')).toBe('severe');
    expect(classifySeverity('Contraindicated')).toBe('contraindicated');
  });

  it('defaults unknown values to none', () => {
    expect(classifySeverity('unknown-value')).toBe('none');
    expect(classifySeverity('')).toBe('none');
  });
});

// ── cache behavior tests ──────────────────────────────────────────────────────

describe('checkDrugInteractions caching', () => {
  it('returns cached result on cache hit without calling Gemini', async () => {
    const cached: DrugInteractionResult = {
      interactions: [
        {
          drug1: 'Warfarin',
          drug2: 'Aspirin',
          severity: 'severe',
          description: 'Increased bleeding risk',
          recommendation: 'Avoid combination',
        },
      ],
      severity: 'severe',
      summary: 'Cached severe interaction.',
      disclaimer: 'cached',
    };
    mockCacheGet.mockResolvedValue(cached);

    const { checkDrugInteractions: check } = await import('./ai.service');
    const result = await check(['Warfarin', 'Aspirin']);

    expect(mockCacheGet).toHaveBeenCalled();
    expect(mockGenerateContent).not.toHaveBeenCalled();
    expect(result.summary).toBe('Cached severe interaction.');
  });

  it('calls Gemini and populates cache on cache miss', async () => {
    mockCacheGet.mockResolvedValue(null);
    mockGenerateContent.mockResolvedValue({
      response: {
        text: () =>
          JSON.stringify({
            interactions: [],
            severity: 'none',
            summary: 'No interactions found.',
          }),
      },
    });

    const { checkDrugInteractions: check } = await import('./ai.service');
    await check(['Aspirin', 'Ibuprofen']);

    expect(mockGenerateContent).toHaveBeenCalledTimes(1);
    expect(mockCacheSet).toHaveBeenCalled();
  });

  it('uses an order-independent cache key for the same drug pair', async () => {
    mockGenerateContent.mockResolvedValue({
      response: {
        text: () =>
          JSON.stringify({ interactions: [], severity: 'none', summary: 'None.' }),
      },
    });

    const { checkDrugInteractions: check } = await import('./ai.service');
    await check(['Aspirin', 'Warfarin']);
    const firstKey = mockCacheGet.mock.calls[0][0];
    await check(['Warfarin', 'Aspirin']);
    const secondKey = mockCacheGet.mock.calls[1][0];

    expect(firstKey).toBe(secondKey);
  });
});

// ── CDS alert tests ───────────────────────────────────────────────────────────

describe('checkDrugInteractions CDS alerts', () => {
  it('emits a CDS alert for a severe interaction', async () => {
    mockGenerateContent.mockResolvedValue({
      response: {
        text: () =>
          JSON.stringify({
            interactions: [
              {
                drug1: 'Warfarin',
                drug2: 'Aspirin',
                severity: 'severe',
                description: 'Increased bleeding risk',
                recommendation: 'Avoid combination',
              },
            ],
            severity: 'severe',
            summary: 'Severe interaction.',
          }),
      },
    });

    const { checkDrugInteractions: check } = await import('./ai.service');
    await check(['Warfarin', 'Aspirin']);

    expect(mockEmitCdsAlert).toHaveBeenCalledTimes(1);
    const alert = mockEmitCdsAlert.mock.calls[0][0];
    expect(alert.severity).toBe('severe');
  });

  it('emits a CDS alert for a contraindicated interaction', async () => {
    mockGenerateContent.mockResolvedValue({
      response: {
        text: () =>
          JSON.stringify({
            interactions: [
              {
                drug1: 'DrugA',
                drug2: 'DrugB',
                severity: 'contraindicated',
                description: 'Absolute contraindication',
                recommendation: 'Do not co-administer',
              },
            ],
            severity: 'contraindicated',
            summary: 'Contraindicated interaction.',
          }),
      },
    });

    const { checkDrugInteractions: check } = await import('./ai.service');
    await check(['DrugA', 'DrugB']);

    expect(mockEmitCdsAlert).toHaveBeenCalledTimes(1);
    expect(mockEmitCdsAlert.mock.calls[0][0].severity).toBe('contraindicated');
  });

  it('does not emit a CDS alert for mild or moderate interactions', async () => {
    mockGenerateContent.mockResolvedValue({
      response: {
        text: () =>
          JSON.stringify({
            interactions: [
              {
                drug1: 'DrugA',
                drug2: 'DrugB',
                severity: 'moderate',
                description: 'Moderate interaction',
                recommendation: 'Monitor',
              },
            ],
            severity: 'moderate',
            summary: 'Moderate interaction.',
          }),
      },
    });

    const { checkDrugInteractions: check } = await import('./ai.service');
    await check(['DrugA', 'DrugB']);

    expect(mockEmitCdsAlert).not.toHaveBeenCalled();
  });
});
