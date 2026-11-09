import "server-only";

import {
  createHash,
  randomBytes,
  scrypt as scryptCallback,
  timingSafeEqual,
} from "node:crypto";
import { cookies } from "next/headers";
import type { RowDataPacket } from "mysql2";
import { getDb } from "@/lib/db";

const SESSION_COOKIE = "crud_session";
const SESSION_TTL_SECONDS = 60 * 60 * 24 * 7;
const PASSWORD_KEY_LENGTH = 32;

export type Credentials = {
  email: string;
  password: string;
};

export type AuthenticatedUser = {
  id: string;
  email: string;
};

interface AuthenticatedUserRow extends RowDataPacket {
  id: string;
  email: string;
}

let authTablesPromise: Promise<void> | undefined;

function derivePasswordKey(password: string, salt: Buffer): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    scryptCallback(
      password,
      salt,
      PASSWORD_KEY_LENGTH,
      { N: 16_384, r: 8, p: 1, maxmem: 64 * 1024 * 1024 },
      (error, key) => {
        if (error) {
          reject(error);
        } else {
          resolve(key);
        }
      },
    );
  });
}

export async function ensureAuthTables(): Promise<void> {
  if (!authTablesPromise) {
    authTablesPromise = (async () => {
      const db = getDb();
      await db.query(`
        CREATE TABLE IF NOT EXISTS auth_users (
          id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
          email VARCHAR(254) NOT NULL UNIQUE,
          password_hash VARCHAR(255) NOT NULL,
          created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
        )
      `);
      await db.query(`
        CREATE TABLE IF NOT EXISTS auth_sessions (
          token_hash CHAR(64) NOT NULL PRIMARY KEY,
          user_id BIGINT UNSIGNED NOT NULL,
          expires_at DATETIME NOT NULL,
          created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
          INDEX auth_sessions_user_id_idx (user_id),
          CONSTRAINT auth_sessions_user_id_fk
            FOREIGN KEY (user_id) REFERENCES auth_users(id) ON DELETE CASCADE
        )
      `);
    })();
  }

  try {
    await authTablesPromise;
  } catch (error) {
    authTablesPromise = undefined;
    throw error;
  }
}

export async function readCredentials(
  request: Request,
): Promise<Credentials | null> {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return null;
  }

  if (
    typeof body !== "object" ||
    body === null ||
    !("email" in body) ||
    !("password" in body) ||
    typeof body.email !== "string" ||
    typeof body.password !== "string"
  ) {
    return null;
  }

  const email = body.email.trim().toLowerCase();
  if (
    email.length > 254 ||
    !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) ||
    body.password.length === 0 ||
    body.password.length > 128
  ) {
    return null;
  }

  return { email, password: body.password };
}

export async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(16);
  const key = await derivePasswordKey(password, salt);
  return `scrypt$${salt.toString("base64url")}$${key.toString("base64url")}`;
}

export async function verifyPassword(
  password: string,
  storedHash: string,
): Promise<boolean> {
  const [algorithm, saltValue, keyValue, ...extra] = storedHash.split("$");
  if (
    algorithm !== "scrypt" ||
    !saltValue ||
    !keyValue ||
    extra.length > 0
  ) {
    return false;
  }

  const salt = Buffer.from(saltValue, "base64url");
  const expectedKey = Buffer.from(keyValue, "base64url");
  if (salt.length !== 16 || expectedKey.length !== PASSWORD_KEY_LENGTH) {
    return false;
  }

  const actualKey = await derivePasswordKey(password, salt);
  return timingSafeEqual(actualKey, expectedKey);
}

export function hashSessionToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

export async function createSession(userId: string): Promise<void> {
  const token = randomBytes(32).toString("base64url");
  const expiresAt = new Date(Date.now() + SESSION_TTL_SECONDS * 1000);
  const expiresAtUtc = expiresAt.toISOString().slice(0, 19).replace("T", " ");
  const db = getDb();

  await db.execute(
    "INSERT INTO auth_sessions (token_hash, user_id, expires_at) VALUES (?, ?, ?)",
    [hashSessionToken(token), userId, expiresAtUtc],
  );

  const cookieStore = await cookies();
  cookieStore.set(SESSION_COOKIE, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: SESSION_TTL_SECONDS,
    expires: expiresAt,
  });
}

export async function getSessionToken(): Promise<string | undefined> {
  const cookieStore = await cookies();
  return cookieStore.get(SESSION_COOKIE)?.value;
}

export async function getAuthenticatedUser(): Promise<AuthenticatedUser | null> {
  const token = await getSessionToken();
  if (!token) {
    return null;
  }

  await ensureAuthTables();
  const [users] = await getDb().execute<AuthenticatedUserRow[]>(
    `SELECT CAST(u.id AS CHAR) AS id, u.email
     FROM auth_sessions s
     INNER JOIN auth_users u ON u.id = s.user_id
     WHERE s.token_hash = ? AND s.expires_at > UTC_TIMESTAMP()
     LIMIT 1`,
    [hashSessionToken(token)],
  );

  return users[0] ? { id: users[0].id, email: users[0].email } : null;
}

export async function deleteSession(token: string | undefined): Promise<void> {
  const cookieStore = await cookies();
  cookieStore.delete(SESSION_COOKIE);

  if (token) {
    await getDb().execute("DELETE FROM auth_sessions WHERE token_hash = ?", [
      hashSessionToken(token),
    ]);
  }
}
