import { connection } from "next/server";
import { getDb } from "@/lib/db";

export async function GET() {
  await connection();

  try {
    await getDb().query("SELECT 1");
    return Response.json({ status: "ok" });
  } catch (error) {
    console.error("MySQL health check failed:", error);
    return Response.json(
      { status: "error", message: "Database connection unavailable" },
      { status: 503 },
    );
  }
}
