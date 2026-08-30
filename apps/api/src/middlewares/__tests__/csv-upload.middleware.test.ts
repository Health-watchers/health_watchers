import request from 'supertest';
import express, { Request, Response } from 'express';
import multer from 'multer';
import { csvUploadMiddleware, handleCsvUploadError } from '../csv-upload.middleware';

function buildApp() {
  const app = express();
  app.post('/upload', csvUploadMiddleware, (_req: Request, res: Response) => {
    res.json({ ok: true });
  });
  app.use(handleCsvUploadError);
  return app;
}

describe('csvUploadMiddleware', () => {
  it('accepts a .csv file', async () => {
    const res = await request(buildApp())
      .post('/upload')
      .attach('file', Buffer.from('a,b,c\n1,2,3'), {
        filename: 'data.csv',
        contentType: 'text/csv',
      });

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ ok: true });
  });

  it('rejects a non-csv file with 400', async () => {
    const res = await request(buildApp())
      .post('/upload')
      .attach('file', Buffer.from('not a csv'), {
        filename: 'data.txt',
        contentType: 'text/plain',
      });

    expect(res.status).toBe(400);
    expect(res.body).toEqual(
      expect.objectContaining({ error: 'FileUploadError', message: 'Only CSV files are allowed' })
    );
  });
});

describe('handleCsvUploadError', () => {
  function mockRes() {
    const res: Partial<Response> = {};
    res.status = jest.fn().mockReturnValue(res);
    res.json = jest.fn().mockReturnValue(res);
    return res as Response;
  }

  it('returns 400 for a MulterError', () => {
    const res = mockRes();
    const next = jest.fn();
    const err = new multer.MulterError('LIMIT_FILE_SIZE');

    handleCsvUploadError(err, {} as Request, res, next);

    expect(res.status).toHaveBeenCalledWith(400);
    expect(next).not.toHaveBeenCalled();
  });

  it('forwards unrelated errors to next', () => {
    const res = mockRes();
    const next = jest.fn();
    const err = new Error('some other failure');

    handleCsvUploadError(err, {} as Request, res, next);

    expect(next).toHaveBeenCalledWith(err);
    expect(res.status).not.toHaveBeenCalled();
  });
});
