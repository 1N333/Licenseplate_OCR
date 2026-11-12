import type { RowDataPacket } from "mysql2";
import { getDb } from "@/lib/db";
import {
  createSession,
  ensureAuthTables,
  readCredentials,
  verifyPassword,
  type UserRole,
} from "@/lib/auth";

interface LoginUserRow extends RowDataPacket {
  id: string;
  password_hash: string;
  role: UserRole;
}

export async function POST(request: Request) {
  const credentials = await readCredentials(request);
  if (!credentials) {
    return Response.json(
      { error: "Enter a valid email and password." },
      { status: 400 },
    );
  }

  try {
    await ensureAuthTables();
    const [users] = await getDb().execute<LoginUserRow[]>(
      "SELECT CAST(id AS CHAR) AS id, password_hash, role FROM auth_users WHERE email = ? LIMIT 1",
      [credentials.email],
    );
    const user = users[0];
    if (!user || !(await verifyPassword(credentials.password, user.password_hash))) {
      return Response.json(
        { error: "Email or password is incorrect." },
        { status: 401 },
      );
    }

    await createSession(user.id);
    return Response.json({
      user: { email: credentials.email, role: user.role },
    });
  } catch (error) {
    console.error("Login failed:", error);
    return Response.json(
      { error: "Login is unavailable. Please try again later." },
      { status: 503 },
    );
  }
}
