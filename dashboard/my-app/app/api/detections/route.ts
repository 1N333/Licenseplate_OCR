import { connection } from "next/server";
import { getAuthenticatedUser } from "@/lib/auth";
import {
  apiKeyIsValid,
  ensureDetectionsTable,
  getIngestUserId,
  insertDetection,
  listDetections,
  parseDetectionFields,
  saveDetectionPhoto,
} from "@/lib/detections";

// Called by the Raspberry Pi (multipart: time, direction, plate, device, image).
export async function POST(request: Request) {
  await connection();
  if (!apiKeyIsValid(request.headers.get("x-api-key"))) {
    return Response.json({ error: "Invalid API key." }, { status: 401 });
  }

  let form: FormData;
  try {
    form = await request.formData();
  } catch {
    return Response.json({ error: "Send multipart form data." }, { status: 400 });
  }
  const parsed = parseDetectionFields(form);
  if (typeof parsed === "string") {
    return Response.json({ error: parsed }, { status: 400 });
  }

  try {
    await ensureDetectionsTable();
    const userId = await getIngestUserId();
    if (!userId) {
      return Response.json(
        { error: "PLATE_OWNER_EMAIL does not match a registered account." },
        { status: 503 },
      );
    }
    const image = form.get("image");
    const photo = image instanceof File ? await saveDetectionPhoto(image) : null;
    const { id, carId } = await insertDetection(userId, parsed, photo);
    return Response.json({ id, matched: carId !== null }, { status: 201 });
  } catch (error) {
    console.error("Could not save detection:", error);
    return Response.json({ error: "Could not save detection." }, { status: 503 });
  }
}

// Used by the dashboard (signed-in session).
export async function GET(request: Request) {
  await connection();
  try {
    const user = await getAuthenticatedUser();
    if (!user) {
      return Response.json({ error: "Please sign in." }, { status: 401 });
    }
    await ensureDetectionsTable();
    const limit = Number(new URL(request.url).searchParams.get("limit") ?? "50");
    return Response.json({ detections: await listDetections(user.id, limit) });
  } catch (error) {
    console.error("Could not list detections:", error);
    return Response.json({ error: "Could not load detections." }, { status: 503 });
  }
}
