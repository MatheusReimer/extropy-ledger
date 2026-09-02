import { RECEIPT_MAX_BYTES, type ReceiptMimeType } from '@expense/shared';

/**
 * The first bytes of each format we accept.
 *
 * A browser's `Content-Type` is a claim by the client, and an upload endpoint is
 * the last place to take a client's word for anything (OWASP A04). Sniffing the
 * actual bytes is what stops a renamed executable, a zip bomb, or an SVG full of
 * script from ever reaching the model - or a log line, or a future feature that
 * might be less careful than this one.
 */
const SIGNATURES: ReadonlyArray<{ mimeType: ReceiptMimeType; magic: readonly number[] }> = [
  { mimeType: 'application/pdf', magic: [0x25, 0x50, 0x44, 0x46] }, // %PDF
  { mimeType: 'image/jpeg', magic: [0xff, 0xd8, 0xff] },
  { mimeType: 'image/png', magic: [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a] },
];

/** WebP is RIFF....WEBP - a signature with a four-byte length in the middle. */
const RIFF = [0x52, 0x49, 0x46, 0x46];
const WEBP = [0x57, 0x45, 0x42, 0x50];

const startsWith = (bytes: Uint8Array, magic: readonly number[], offset = 0): boolean =>
  magic.every((byte, index) => bytes[offset + index] === byte);

/** Returns the type the BYTES say it is, or undefined if it is none of them. */
export function sniffMimeType(bytes: Uint8Array): ReceiptMimeType | undefined {
  for (const { mimeType, magic } of SIGNATURES) {
    if (startsWith(bytes, magic)) return mimeType;
  }
  if (startsWith(bytes, RIFF) && startsWith(bytes, WEBP, 8)) return 'image/webp';
  return undefined;
}

export type DecodedUpload =
  | { ok: true; bytes: Buffer; mimeType: ReceiptMimeType }
  | { ok: false; reason: string };

/**
 * Decodes and validates an uploaded file, in the order that fails cheapest first.
 *
 * Size is checked BEFORE decoding, because decoding is where a hostile payload
 * would do its damage: base64 is a known quantity, so the byte count can be
 * derived from the string length without materialising the buffer.
 */
export function decodeUpload(base64: string, maxBytes = RECEIPT_MAX_BYTES): DecodedUpload {
  const payload = base64.includes(',') ? (base64.split(',').pop() ?? '') : base64;
  if (!/^[A-Za-z0-9+/]*={0,2}$/.test(payload)) {
    return { ok: false, reason: 'File data is not valid base64' };
  }

  // Every 4 base64 chars are 3 bytes, minus whatever the padding stands in for.
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

  // The sniffed type wins over whatever the client claimed - the claim is never
  // read again past this point.
  return { ok: true, bytes, mimeType };
}
