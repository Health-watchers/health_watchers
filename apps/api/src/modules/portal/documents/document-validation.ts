const ALLOWED_MIME_TYPES = new Set(['application/pdf', 'image/jpeg', 'image/png']);
const MAX_SIZE_BYTES = 10 * 1024 * 1024;

export interface FileValidationResult {
  valid: boolean;
  reason?: string;
}

export function validateUploadedFile(mimeType: string, sizeBytes: number, fileName: string): FileValidationResult {
  if (!ALLOWED_MIME_TYPES.has(mimeType))
    return { valid: false, reason: `File type "${mimeType}" is not allowed. Accepted types: PDF, JPEG, PNG.` };

  if (sizeBytes > MAX_SIZE_BYTES) {
    const sizeMB = (sizeBytes / (1024 * 1024)).toFixed(1);
    return { valid: false, reason: `File size ${sizeMB}MB exceeds the 10MB limit.` };
  }

  if (!fileName || fileName.trim().length === 0)
    return { valid: false, reason: 'File name is required.' };

  if (fileName.includes('..') || fileName.includes('/') || fileName.includes('\\'))
    return { valid: false, reason: 'File name contains invalid characters.' };

  return { valid: true };
}

export { ALLOWED_MIME_TYPES, MAX_SIZE_BYTES };
