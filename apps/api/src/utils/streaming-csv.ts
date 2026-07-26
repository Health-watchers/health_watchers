import { PassThrough, Transform } from 'stream';
import { Response } from 'express';

export interface StreamingCsvOptions {
  headers: string[];
  batchSize?: number;
  delimiter?: string;
}

export class StreamingCsvGenerator {
  private headers: string[];
  private delimiter: string;
  private batchSize: number;
  private rowCount: number = 0;

  constructor(options: StreamingCsvOptions) {
    this.headers = options.headers;
    this.delimiter = options.delimiter || ',';
    this.batchSize = options.batchSize || 1000;
  }

  private escapeField(value: any): string {
    if (value === null || value === undefined) return '';
    const str = String(value);
    if (str.includes(this.delimiter) || str.includes('"') || str.includes('\n')) {
      return `"${str.replace(/"/g, '""')}"`;
    }
    return str;
  }

  private formatRow(row: Record<string, any>): string {
    return this.headers.map((header) => this.escapeField(row[header])).join(this.delimiter);
  }

  createTransformStream(): Transform {
    const self = this;
    let headerSent = false;

    return new Transform({
      objectMode: true,
      transform(chunk: Record<string, any>[], encoding, callback) {
        if (!headerSent) {
          this.push(self.headers.join(self.delimiter) + '\n');
          headerSent = true;
        }

        for (const row of chunk) {
          this.push(self.formatRow(row) + '\n');
          self.rowCount++;
        }

        callback();
      },
      flush(callback) {
        callback();
      },
    });
  }

  getRowCount(): number {
    return this.rowCount;
  }
}

export interface StreamingExportOptions {
  filename: string;
  contentType: string;
  headers: string[];
}

export function setupStreamingExport(
  res: Response,
  options: StreamingExportOptions
): { transform: Transform; passThrough: PassThrough } {
  const csvGenerator = new StreamingCsvGenerator({
    headers: options.headers,
  });

  const transform = csvGenerator.createTransformStream();
  const passThrough = new PassThrough();

  res.setHeader('Content-Type', options.contentType);
  res.setHeader(
    'Content-Disposition',
    `attachment; filename="${options.filename}"`
  );
  res.setHeader('Transfer-Encoding', 'chunked');

  transform.pipe(passThrough);
  passThrough.pipe(res);

  return { transform, passThrough };
}

export async function streamFromCursor<T>(
  cursor: any,
  transform: Transform,
  batchSize: number = 1000
): Promise<number> {
  let totalRows = 0;
  let batch: T[] = [];

  for await (const doc of cursor) {
    batch.push(doc as T);

    if (batch.length >= batchSize) {
      transform.write(batch);
      totalRows += batch.length;
      batch = [];
    }
  }

  if (batch.length > 0) {
    transform.write(batch);
    totalRows += batch.length;
  }

  transform.end();
  return totalRows;
}
