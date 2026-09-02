import { randomBytes, scrypt, timingSafeEqual } from 'node:crypto';
import { promisify } from 'node:util';

/**
 * scrypt from `node:crypto` - no dependency, no native binary.
 *
 * bcrypt needs a compiled native module (a headache inside a Lambda bundle) and
 * bcryptjs is pure JS and slow. scrypt is a serious KDF, ships with the runtime,
 * and is deliberately expensive in BOTH cpu and memory - which prices GPU
 * attacks higher than bcrypt does. It costs about 100 ms per login, which is
 * exactly the point.
 */
const scryptAsync = promisify(scrypt) as (
  password: string,
  salt: Buffer,
  keylen: number,
  options: { N: number; r: number; p: number; maxmem: number },
) => Promise<Buffer>;

const PARAMS = { N: 32_768, r: 8, p: 1 } as const;
const KEY_LENGTH = 32;
const SALT_LENGTH = 16;
/** scrypt needs roughly 128*N*r bytes; Node's 32 MB default cannot fit N=32768. */
const MAXMEM = 64 * 1024 * 1024;

const encode = (buffer: Buffer): string => buffer.toString('base64');

/**
 * The parameters are stored INSIDE the hash.
 *
 * When N is raised two years from now, existing passwords stay verifiable with
 * the parameters they were created under. A hash without embedded parameters is
 * a migration that cannot be performed.
 */
export async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(SALT_LENGTH);
  const derived = await scryptAsync(password, salt, KEY_LENGTH, { ...PARAMS, maxmem: MAXMEM });
  return `scrypt$${PARAMS.N}$${PARAMS.r}$${PARAMS.p}$${encode(salt)}$${encode(derived)}`;
}

export async function verifyPassword(password: string, stored: string): Promise<boolean> {
  const [scheme, n, r, p, saltB64, hashB64] = stored.split('$');
  if (scheme !== 'scrypt' || !n || !r || !p || !saltB64 || !hashB64) return false;

  const expected = Buffer.from(hashB64, 'base64');
  const derived = await scryptAsync(password, Buffer.from(saltB64, 'base64'), expected.length, {
    N: Number(n),
    r: Number(r),
    p: Number(p),
    maxmem: MAXMEM,
  });

  // Constant-time comparison: `===` leaks how long the correct prefix was.
  return derived.length === expected.length && timingSafeEqual(derived, expected);
}
