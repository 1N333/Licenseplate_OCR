import { connection } from "next/server";
import { getAuthenticatedUser } from "@/lib/auth";

export async function GET() {
  await connection();

  try {
    const user = await getAuthenticatedUser();
    if (!user) {
      return Response.json({ error: "Not signed in." }, { status: 401 });
    }

    return Response.json(
      { user: { email: user.email, role: user.role } },
      { headers: { "Cache-Control": "private, no-store" } },
    );
  } catch (error) {
    console.error("Session lookup failed:", error);
    return Response.json(
      { error: "Authentication is unavailable. Please try again later." },
      { status: 503 },
    );
  }
}
