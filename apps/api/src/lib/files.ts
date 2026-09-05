import { RECEIPT_MAX_BYTES, type ReceiptMimeType } from '@expense/shared';

const SIGNATURES: ReadonlyArray<{ mimeType: ReceiptMimeType; magic: readonly number[] }> = [
  { mimeType: 'application/pdf', magic: [0x25, 0x50, 0x44, 0x46] },
  { mimeType: 'image/jpeg', magic: [0xff, 0xd8, 0xff] },
  { mimeType: 'image/png', magic: [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a] },
];

const RIFF = [0x52, 0x49, 0x46, 0x46];
const WEBP = [0x57, 0x45, 0x42, 0x50];

const startsWith = (bytes: Uint8Array, magic: readonly number[], offset = 0): boolean =>
  magic.every((byte, index) => bytes[offset + index] === byte);

export function sniffMimeType(bytes: Uint8Array): ReceiptMimeType | undefined {
  for (const { mimeType, magic } of SIGNATURES) {
    if (startsWith(bytes, magic)) return mimeType;
  }
  if (startsWith(bytes, RIFF) && startsWith(bytes, WEBP, 8)) return 'image/webp';
  return undefined;
}

export type DecodedUpload =
  { ok: true; bytes: Buffer; mimeType: ReceiptMimeType } | { ok: false; reason: string };

export function decodeUpload(base64: string, maxBytes = RECEIPT_MAX_BYTES): DecodedUpload {
  const payload = base64.includes(',') ? (base64.split(',').pop() ?? '') : base64;
  if (!/^[A-Za-z0-9+/]*={0,2}$/.test(payload)) {
    return { ok: false, reason: 'File data is not valid base64' };
  }

  const padding = payload.endsWith('==') ? 2 : payload.endsWith('=') ? 1 : 0;
  const declaredBytes = Math.floor((payload.length * 3) / 4) - padding;
  if (declaredBytes > maxBytes) {
    return { ok: false, reason: `File is larger than ${Math.round(maxBytes / 1024 / 1024)} MB` };
  }
  if (declaredBytes <= 0) return { ok: false, reason: 'File is empty' };

  const bytes = Buffer.from(payload, 'base64');
  if (bytes.length > maxBytes) return { ok: false, reason: 'File is too large' };

  const mimeType = sniffMimeType(bytes);
  if (!mimeType) {
    return { ok: false, reason: 'That file is not a PDF, JPEG, PNG or WebP' };
  }

  return { ok: true, bytes, mimeType };
}
