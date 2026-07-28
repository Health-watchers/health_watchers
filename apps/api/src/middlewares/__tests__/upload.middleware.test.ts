import request from 'supertest';
import express, { Request, Response, NextFunction } from 'express';
import { imageUpload, documentUpload } from '../upload.middleware';

function buildApp(uploader: typeof imageUpload) {
  const app = express();
  app.post('/upload', uploader.single('file'), (_req: Request, res: Response) => {
    res.json({ ok: true });
  });
  app.use((err: any, _req: Request, res: Response, _next: NextFunction) => {
    res.status(400).json({ error: err.code ?? 'UploadError', message: err.message });
  });
  return app;
}

describe('imageUpload', () => {
  it('accepts an allowed image mimetype', async () => {
    const res = await request(buildApp(imageUpload))
      .post('/upload')
      .attach('file', Buffer.from('fake-image'), { filename: 'photo.png', contentType: 'image/png' });

    expect(res.status).toBe(200);
  });

  it('rejects a disallowed mimetype', async () => {
    const res = await request(buildApp(imageUpload))
      .post('/upload')
      .attach('file', Buffer.from('fake-pdf'), { filename: 'doc.pdf', contentType: 'application/pdf' });

    expect(res.status).toBe(400);
    expect(res.body.error).toBe('INVALID_FILE_TYPE');
  });
});

describe('documentUpload', () => {
  it('accepts an allowed document mimetype', async () => {
    const res = await request(buildApp(documentUpload))
      .post('/upload')
      .attach('file', Buffer.from('fake-pdf'), { filename: 'doc.pdf', contentType: 'application/pdf' });

    expect(res.status).toBe(200);
  });

  it('rejects a disallowed mimetype', async () => {
    const res = await request(buildApp(documentUpload))
      .post('/upload')
      .attach('file', Buffer.from('fake-video'), { filename: 'clip.mp4', contentType: 'video/mp4' });

    expect(res.status).toBe(400);
    expect(res.body.error).toBe('INVALID_FILE_TYPE');
  });
});
