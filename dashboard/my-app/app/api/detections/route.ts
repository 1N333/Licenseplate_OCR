import { connection } from "next/server";
import { getAuthenticatedUser } from "@/lib/auth";
import {
  apiKeyIsValid,
  DetectionPhotoValidationError,
  ensureDetectionsTable,
  getIngestUserId,
  insertDetection,
  listDetections,
  parseDetectionFields,
  removeDetectionPhoto,
  saveDetectionPhoto,
} from "@/lib/detections";

export async function POST(request: Request) {
  await connection();
  if (!apiKeyIsValid(request.headers.get("x-api-key"))) {
    return Response.json({ error: "Invalid API key." }, { status: 401 });
  }

  let form: FormData;
  try {
    form = await request.formData();
  } catch {
    return Response.json(
      { error: "Send multipart form data." },
      { status: 400 },
    );
  }

  const parsed = parseDetectionFields(form);
  if (typeof parsed === "string") {
    return Response.json({ error: parsed }, { status: 400 });
  }

  let photoFilename: string | null = null;
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
    if (image instanceof File && image.size > 0) {
      photoFilename = await saveDetectionPhoto(image);
    }
    const result = await insertDetection(userId, parsed, photoFilename);
    return Response.json(result, { status: 201 });
  } catch (error) {
    if (photoFilename) {
      try {
        await removeDetectionPhoto(photoFilename);
      } catch (cleanupError) {
        console.error("Could not remove an unused detection photo:", cleanupError);
      }
    }
    if (error instanceof DetectionPhotoValidationError) {
      return Response.json({ error: error.message }, { status: 400 });
    }

    console.error("Could not save detection:", error);
    return Response.json(
      { error: "Could not save detection. Please try again." },
      { status: 503 },
    );
  }
}

export async function GET(request: Request) {
  await connection();
  try {
    const user = await getAuthenticatedUser();
    if (!user) {
      return Response.json({ error: "Please sign in." }, { status: 401 });
    }

    await ensureDetectionsTable();
    const rawLimit = new URL(request.url).searchParams.get("limit");
    const limit = rawLimit === null ? 50 : Number(rawLimit);
    if (!Number.isInteger(limit) || limit < 1 || limit > 200) {
      return Response.json({ error: "Invalid detection limit." }, { status: 400 });
    }

    return Response.json(
      { detections: await listDetections(user.id, limit) },
      { headers: { "Cache-Control": "private, no-store" } },
    );
  } catch (error) {
    console.error("Could not list detections:", error);
    return Response.json(
      { error: "Could not load detections. Please try again." },
      { status: 503 },
    );
  }
}
