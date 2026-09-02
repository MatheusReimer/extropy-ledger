import { SignJWT, jwtVerify, errors as joseErrors } from 'jose';
import { getConfig } from '../config.js';

/**
 * `jose` rather than a hand-rolled JWT.
 *
 * Signing HS256 by hand is about 40 lines; VERIFYING it correctly is not.
 * Algorithm confusion (`alg: none`, HS256 checked against an RSA key),
 * constant-time signature comparison and expiry handling are exactly where
 * home-grown implementations fail. Audited library, zero dependencies.
 */
const secretKey = (): Uint8Array => new TextEncoder().encode(getConfig().JWT_SECRET);

const ISSUER = 'expense-tracker';

export async function signAccessToken(userId: string): Promise<string> {
  return new SignJWT({})
    .setProtectedHeader({ alg: 'HS256' })
    .setSubject(userId)
    .setIssuer(ISSUER)
    .setIssuedAt()
    .setExpirationTime(getConfig().JWT_TTL)
    .sign(secretKey());
}

export type VerifiedToken = { userId: string };

/**
 * Returns `undefined` instead of throwing: an invalid token is an expected flow
 * (expired, tampered with, absent), not an exceptional one. The caller decides
 * what a 401 looks like.
 */
export async function verifyAccessToken(token: string): Promise<VerifiedToken | undefined> {
  try {
    const { payload } = await jwtVerify(token, secretKey(), {
      // Pinning the algorithm is what closes the algorithm-confusion door.
      algorithms: ['HS256'],
      issuer: ISSUER,
    });
    return typeof payload.sub === 'string' ? { userId: payload.sub } : undefined;
  } catch (error) {
    if (error instanceof joseErrors.JOSEError) return undefined;
    throw error;
  }
}
