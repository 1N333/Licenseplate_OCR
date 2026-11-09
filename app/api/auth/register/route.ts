import type { ResultSetHeader } from "mysql2";
import { getDb } from "@/lib/db";
import {
  createSession,
  ensureAuthTables,
  hashPassword,
  readCredentials,
} from "@/lib/auth";

function isDuplicateEmailError(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    error.code === "ER_DUP_ENTRY"
  );
}

export async function POST(request: Request) {
  const credentials = await readCredentials(request);
  if (!credentials) {
    return Response.json(
      { error: "Enter a valid email and password." },
      { status: 400 },
    );
  }
  if (credentials.password.length < 8) {
    return Response.json(
      { error: "Password must be at least 8 characters." },
      { status: 400 },
    );
  }

  try {
    await ensureAuthTables();
    const passwordHash = await hashPassword(credentials.password);
    const [result] = await getDb().execute<ResultSetHeader>(
      "INSERT INTO auth_users (email, password_hash) VALUES (?, ?)",
      [credentials.email, passwordHash],
    );

    await createSession(String(result.insertId));
    return Response.json({ user: { email: credentials.email } }, { status: 201 });
  } catch (error) {
    if (isDuplicateEmailError(error)) {
      return Response.json(
        { error: "An account with this email already exists." },
        { status: 409 },
      );
    }

    console.error("Account registration failed:", error);
    return Response.json(
      { error: "Registration is unavailable. Please try again later." },
      { status: 503 },
    );
  }
}
