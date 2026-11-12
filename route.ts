import {
  deleteSession,
  ensureAuthTables,
  getSessionToken,
} from "@/lib/auth";

export async function POST() {
  try {
    await ensureAuthTables();
    await deleteSession(await getSessionToken());
    return Response.json({ success: true });
  } catch (error) {
    console.error("Logout failed:", error);
    return Response.json(
      { error: "Logout is unavailable. Please try again later." },
      { status: 503 },
    );
  }
}
