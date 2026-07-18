export const ALLOWED_MIME_TYPES = [
  'image/png',
  'image/jpeg',
  'application/pdf',
  'application/json',
] as const;

// Matches any of ALLOWED_MIME_TYPES; used by FileTypeValidator which accepts
// a RegExp (or string mime). Building it from the list keeps one source of truth.
export const ALLOWED_MIME_TYPE_REGEX = new RegExp(
  ALLOWED_MIME_TYPES.map((t) => t.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|'),
);

export const MAX_FILE_SIZE_BYTES = 10 * 1024 * 1024; // 10 MB

export const LAT_MIN = -90;
export const LAT_MAX = 90;
export const LNG_MIN = -180;
export const LNG_MAX = 180;
