import { SignJWT, jwtVerify, errors as joseErrors } from 'jose';
import { getConfig } from '../config.js';

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

export async function verifyAccessToken(token: string): Promise<VerifiedToken | undefined> {
  try {
    const { payload } = await jwtVerify(token, secretKey(), {
      algorithms: ['HS256'],
      issuer: ISSUER,
    });
    return typeof payload.sub === 'string' ? { userId: payload.sub } : undefined;
  } catch (error) {
    if (error instanceof joseErrors.JOSEError) return undefined;
    throw error;
  }
}
