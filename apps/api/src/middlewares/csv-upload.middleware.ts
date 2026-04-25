import multer from 'multer';
import { Request, Response, NextFunction } from 'express';

const MAX_CSV_SIZE = 10 * 1024 * 1024; // 10 MB

const csvUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: MAX_CSV_SIZE },
  fileFilter: (_req, file, cb) => {
    if (file.mimetype === 'text/csv' || file.originalname.endsWith('.csv')) {
      cb(null, true);
    } else {
      cb(new Error('Only CSV files are allowed'));
    }
  },
});

export const csvUploadMiddleware = csvUpload.single('file');

/** Wraps multer errors into a standard JSON response */
export function handleCsvUploadError(err: any, _req: Request, res: Response, next: NextFunction) {
  if (err instanceof multer.MulterError || err?.message === 'Only CSV files are allowed') {
    return res.status(400).json({ error: 'FileUploadError', message: err.message });
  }
  return next(err);
}
