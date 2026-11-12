import { connection } from "next/server";
import { getAuthenticatedUser } from "@/lib/auth";
import {
  ensureDetectionsTable,
  getDetectionPhotoForUser,
  readDetectionPhoto,
} from "@/lib/detections";

type RouteContext = { params: Promise<{ id: string }> };

export async function GET(_request: Request, { params }: RouteContext) {
  await connection();
  const { id } = await params;
  if (!/^[1-9]\d{0,19}$/.test(id)) {
    return Response.json({ error: "Invalid detection record." }, { status: 400 });
  }

  try {
    const user = await getAuthenticatedUser();
    if (!user) {
      return Response.json({ error: "Please sign in." }, { status: 401 });
    }

    await ensureDetectionsTable();
    const filename = await getDetectionPhotoForUser(user.id, id);
    if (!filename) {
      return Response.json({ error: "Detection photo not found." }, { status: 404 });
    }

    const image = await readDetectionPhoto(filename);
    return new Response(new Uint8Array(image), {
      headers: {
        "Content-Type": filename.endsWith(".png") ? "image/png" : "image/jpeg",
        "Cache-Control": "private, no-store",
        "X-Content-Type-Options": "nosniff",
      },
    });
  } catch (error) {
    console.error("Could not read detection photo:", error);
    return Response.json(
      { error: "Detection photo is unavailable." },
      { status: 404 },
    );
  }
}
