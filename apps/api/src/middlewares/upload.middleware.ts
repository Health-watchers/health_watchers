import multer, { FileFilterCallback } from 'multer';
import { Request } from 'express';

/** Allowed MIME types for document uploads */
export const ALLOWED_DOCUMENT_TYPES = ['application/pdf', 'image/jpeg', 'image/png'] as const;

/** Allowed MIME types for image uploads */
export const ALLOWED_IMAGE_TYPES = ['image/jpeg', 'image/png', 'image/webp'] as const;

/** Max file sizes */
export const MAX_DOCUMENT_SIZE_BYTES = 10 * 1024 * 1024; // 10 MB
export const MAX_IMAGE_SIZE_BYTES = 5 * 1024 * 1024; //  5 MB

function fileFilter(allowedTypes: readonly string[]) {
  return (_req: Request, file: Express.Multer.File, cb: FileFilterCallback) => {
    if (allowedTypes.includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(
        Object.assign(
          new Error(`Unsupported file type: ${file.mimetype}. Allowed: ${allowedTypes.join(', ')}`),
          { code: 'INVALID_FILE_TYPE' }
        )
      );
    }
  };
}

const storage = multer.memoryStorage();

export const imageUpload = multer({
  storage,
  limits: { fileSize: MAX_IMAGE_SIZE_BYTES },
  fileFilter: fileFilter(ALLOWED_IMAGE_TYPES),
});

export const documentUpload = multer({
  storage,
  limits: { fileSize: MAX_DOCUMENT_SIZE_BYTES },
  fileFilter: fileFilter(ALLOWED_DOCUMENT_TYPES),
});
