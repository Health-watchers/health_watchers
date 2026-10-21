import { Injectable, Logger, OnModuleDestroy } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

export type TranscriptionProvider = 'google' | 'whisper';

export interface TranscriptionResult {
  transcript: string;
  provider: TranscriptionProvider;
  language?: string;
  durationSeconds?: number;
}

export interface SoapNoteFields {
  subjective: string;
  objective: string;
  assessment: string;
  plan: string;
}

export interface TranscriptionJob {
  id: string;
  encounterId: string;
  audio: Buffer;
  mimeType: string;
  language?: string;
  createdAt: Date;
}

export interface TranscriptionJobResult {
  jobId: string;
  encounterId: string;
  transcript: string;
  soap: SoapNoteFields;
  provider: TranscriptionProvider;
  completedAt: Date;
}

export type TranscriptionJobHandler = (
  result: TranscriptionJobResult,
) => Promise<void> | void;

const SOAP_SECTION_PATTERNS: Array<{ key: keyof SoapNoteFields; regex: RegExp }> = [
  { key: 'subjective', regex: /\b(subjective|s:)\b/i },
  { key: 'objective', regex: /\b(objective|o:)\b/i },
  { key: 'assessment', regex: /\b(assessment|a:)\b/i },
  { key: 'plan', regex: /\b(plan|p:)\b/i },
];

@Injectable()
export class TranscriptionService implements OnModuleDestroy {
  private readonly logger = new Logger(TranscriptionService.name);
  private readonly provider: TranscriptionProvider;
  private readonly queue: TranscriptionJob[] = [];
  private readonly handlers = new Map<string, TranscriptionJobHandler>();
  private processing = false;
  private stopped = false;

  constructor(private readonly configService: ConfigService) {
    const configured = (
      this.configService.get<string>('AI_TRANSCRIPTION_PROVIDER') ?? 'whisper'
    ).toLowerCase();
    this.provider = configured === 'google' ? 'google' : 'whisper';
  }

  getProvider(): TranscriptionProvider {
    return this.provider;
  }

  /**
   * Transcribe an audio buffer using the configured provider.
   */
  async transcribe(
    audio: Buffer,
    mimeType: string,
    language?: string,
  ): Promise<TranscriptionResult> {
    if (!audio || audio.length === 0) {
      throw new Error('Audio buffer is empty');
    }

    try {
      if (this.provider === 'google') {
        return await this.transcribeWithGoogle(audio, mimeType, language);
      }
      return await this.transcribeWithWhisper(audio, mimeType, language);
    } finally {
      // PHI minimization: zero out the buffer after transcription.
      this.wipeBuffer(audio);
    }
  }

  /**
   * Map a raw transcript into SOAP note fields.
   */
  mapToSoap(transcript: string): SoapNoteFields {
    const empty: SoapNoteFields = {
      subjective: '',
      objective: '',
      assessment: '',
      plan: '',
    };

    if (!transcript || transcript.trim().length === 0) {
      return empty;
    }

    const normalized = transcript.replace(/\r\n/g, '\n').trim();
    const lines = normalized.split('\n');

    // Detect explicit SOAP section headers.
    const headerIndices: Array<{ key: keyof SoapNoteFields; index: number }> = [];
    lines.forEach((line, index) => {
      const trimmed = line.trim();
      for (const pattern of SOAP_SECTION_PATTERNS) {
        if (pattern.regex.test(trimmed) && trimmed.length <= 40) {
          headerIndices.push({ key: pattern.key, index });
          break;
        }
      }
    });

    if (headerIndices.length > 0) {
      for (let i = 0; i < headerIndices.length; i += 1) {
        const current = headerIndices[i];
        const next = headerIndices[i + 1];
        const start = current.index + 1;
        const end = next ? next.index : lines.length;
        const body = lines
          .slice(start, end)
          .join('\n')
          .replace(/^[\s:.-]+/, '')
          .trim();
        if (body.length > 0) {
          empty[current.key] = empty[current.key]
            ? `${empty[current.key]}\n${body}`
            : body;
        }
      }
      return empty;
    }

    // Fallback: heuristic assignment when no explicit headers exist.
    const sentences = normalized
      .split(/(?<=[.!?])\s+/)
      .map((s) => s.trim())
      .filter((s) => s.length > 0);

    const buckets: Record<keyof SoapFieldsKeys, string[]> = {
      subjective: [],
      objective: [],
      assessment: [],
      plan: [],
    };

    for (const sentence of sentences) {
      const lower = sentence.toLowerCase();
      if (/\b(plan|will|recommend|prescribe|follow[- ]?up|schedule|advise)\b/.test(lower)) {
        buckets.plan.push(sentence);
      } else if (/\b(assessment|diagnos|impression|likely|consistent with|suspect)\b/.test(lower)) {
        buckets.assessment.push(sentence);
      } else if (/\b(objective|exam|vitals|blood pressure|temperature|heart rate|observed|measured|bp|hr|temp)\b/.test(lower)) {
        buckets.objective.push(sentence);
      } else {
        buckets.subjective.push(sentence);
      }
    }

    empty.subjective = buckets.subjective.join(' ').trim();
    empty.objective = buckets.objective.join(' ').trim();
    empty.assessment = buckets.assessment.join(' ').trim();
    empty.plan = buckets.plan.join(' ').trim();

    // If everything landed in subjective, keep it there as a safe default.
    return empty;
  }

  /**
   * Enqueue a transcription job for async processing.
   */
  enqueue(
    job: Omit<TranscriptionJob, 'id' | 'createdAt'> & { id?: string },
    handler?: TranscriptionJobHandler,
  ): string {
    const id = job.id ?? this.generateId();
    const queued: TranscriptionJob = {
      id,
      encounterId: job.encounterId,
      audio: job.audio,
      mimeType: job.mimeType,
      language: job.language,
      createdAt: new Date(),
    };

    if (handler) {
      this.handlers.set(id, handler);
    }

    this.queue.push(queued);
    void this.processQueue();
    return id;
  }

  /**
   * Process the queue serially.
   */
  private async processQueue(): Promise<void> {
    if (this.processing || this.stopped) {
      return;
    }
    this.processing = true;

    try {
      while (this.queue.length > 0 && !this.stopped) {
        const job = this.queue.shift();
        if (!job) {
          break;
        }
        await this.processJob(job);
      }
    } finally {
      this.processing = false;
    }
  }

  private async processJob(job: TranscriptionJob): Promise<void> {
    try {
      const result = await this.transcribe(job.audio, job.mimeType, job.language);
      const soap = this.mapToSoap(result.transcript);

      const jobResult: TranscriptionJobResult = {
        jobId: job.id,
        encounterId: job.encounterId,
        transcript: result.transcript,
        soap,
        provider: result.provider,
        completedAt: new Date(),
      };

      const handler = this.handlers.get(job.id);
      if (handler) {
        try {
          await handler(jobResult);
        } catch (handlerError) {
          this.logger.error(
            `Transcription handler failed for job ${job.id}: ${(handlerError as Error).message}`,
          );
        } finally {
          this.handlers.delete(job.id);
        }
      }
    } catch (error) {
      this.logger.error(
        `Transcription job ${job.id} failed: ${(error as Error).message}`,
      );
    } finally {
      // PHI minimization: ensure audio buffer is wiped after processing.
      this.wipeBuffer(job.audio);
      this.handlers.delete(job.id);
    }
  }

  private wipeBuffer(buffer: Buffer): void {
    if (buffer && buffer.length > 0) {
      buffer.fill(0);
    }
  }

  private generateId(): string {
    return `tx_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
  }

  private async transcribeWithGoogle(
    audio: Buffer,
    mimeType: string,
    language?: string,
  ): Promise<TranscriptionResult> {
    const apiKey = this.configService.get<string>('GOOGLE_SPEECH_API_KEY');
    if (!apiKey) {
      throw new Error('GOOGLE_SPEECH_API_KEY is not configured');
    }

    const encoding = this.mapMimeToGoogleEncoding(mimeType);
    const response = await fetch(
      `https://speech.googleapis.com/v1/speech:recognize?key=${encodeURIComponent(apiKey)}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          config: {
            encoding,
            sampleRateHertz: 16000,
            languageCode: language ?? 'en-US',
            enableAutomaticPunctuation: true,
          },
          audio: { content: audio.toString('base64') },
        }),
      },
    );

    if (!response.ok) {
      const text = await response.text();
      throw new Error(`Google Speech-to-Text failed: ${response.status} ${text}`);
    }

    const data = (await response.json()) as {
      results?: Array<{ alternatives?: Array<{ transcript?: string }> }>;
    };

    const transcript = (data.results ?? [])
      .map((r) => r.alternatives?.[0]?.transcript ?? '')
      .join(' ')
      .trim();

    return {
      transcript,
      provider: 'google',
      language: language ?? 'en-US',
    };
  }

  private async transcribeWithWhisper(
    audio: Buffer,
    mimeType: string,
    language?: string,
  ): Promise<TranscriptionResult> {
    const apiKey = this.configService.get<string>('OPENAI_API_KEY');
    if (!apiKey) {
      throw new Error('OPENAI_API_KEY is not configured');
    }

    const model =
      this.configService.get<string>('WHISPER_MODEL') ?? 'whisper-1';

    const form = new FormData();
    const extension = this.mapMimeToExtension(mimeType);
    const blob = new Blob([new Uint8Array(audio)], { type: mimeType });
    form.append('file', blob, `audio.${extension}`);
    form.append('model', model);
    if (language) {
      form.append('language', language);
    }

    const response = await fetch('https://api.openai.com/v1/audio/transcriptions', {
      method: 'POST',
      headers: { Authorization: `Bearer ${apiKey}` },
      body: form,
    });

    if (!response.ok) {
      const text = await response.text();
      throw new Error(`Whisper transcription failed: ${response.status} ${text}`);
    }

    const data = (await response.json()) as {
      text?: string;
      language?: string;
      duration?: number;
    };

    return {
      transcript: (data.text ?? '').trim(),
      provider: 'whisper',
      language: data.language ?? language,
      durationSeconds: data.duration,
    };
  }

  private mapMimeToGoogleEncoding(mimeType: string): string {
    switch (mimeType) {
      case 'audio/flac':
      case 'audio/x-flac':
        return 'FLAC';
      case 'audio/amr':
        return 'AMR';
      case 'audio/amr-wb':
        return 'AMR_WB';
      case 'audio/mpeg':
      case 'audio/mp3':
        return 'MP3';
      case 'audio/ogg':
        return 'OGG_OPUS';
      case 'audio/webm':
        return 'WEBM_OPUS';
      case 'audio/wav':
      case 'audio/x-wav':
      case 'audio/wave':
      default:
        return 'LINEAR16';
    }
  }

  private mapMimeToExtension(mimeType: string): string {
    switch (mimeType) {
      case 'audio/mpeg':
      case 'audio/mp3':
        return 'mp3';
      case 'audio/ogg':
        return 'ogg';
      case 'audio/webm':
        return 'webm';
      case 'audio/flac':
      case 'audio/x-flac':
        return 'flac';
      case 'audio/mp4':
      case 'audio/m4a':
        return 'm4a';
      case 'audio/wav':
      case 'audio/x-wav':
      case 'audio/wave':
      default:
        return 'wav';
    }
  }

  async onModuleDestroy(): Promise<void> {
    this.stopped = true;
    // Wipe any remaining queued audio buffers.
    while (this.queue.length > 0) {
      const job = this.queue.shift();
      if (job) {
        this.wipeBuffer(job.audio);
      }
    }
    this.handlers.clear();
  }
}

type SoapFieldsKeys = keyof SoapNoteFields;
```

Note: I included a small helper type alias `SoapFieldsKeys` used inside `mapToSoap`. If you prefer to avoid the extra alias, replace `Record<keyof SoapFieldsKeys, string[]>` with `Record<keyof SoapNoteFields, string[]>`.