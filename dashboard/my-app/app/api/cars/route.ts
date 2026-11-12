import { connection } from "next/server";
import { getAuthenticatedUser } from "@/lib/auth";
import {
  CarPhotoValidationError,
  ensureCarsTable,
  insertCar,
  listCarsForUser,
  parseCarForm,
  removeCarPhoto,
  saveCarPhoto,
} from "@/lib/cars";

function isDuplicatePlateError(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    error.code === "ER_DUP_ENTRY"
  );
}

async function cleanUpPhoto(filename: string | null) {
  if (!filename) return;
  try {
    await removeCarPhoto(filename);
  } catch (error) {
    console.error("Could not remove an unused car photo:", error);
  }
}

export async function GET() {
  await connection();

  try {
    const user = await getAuthenticatedUser();
    if (!user) {
      return Response.json({ error: "Please sign in." }, { status: 401 });
    }
    if (user.role !== "office") {
      return Response.json(
        { error: "You do not have permission to manage vehicle records." },
        { status: 403 },
      );
    }

    await ensureCarsTable();
    return Response.json(
      { cars: await listCarsForUser(user.id) },
      { headers: { "Cache-Control": "private, no-store" } },
    );
  } catch (error) {
    console.error("Could not load cars:", error);
    return Response.json(
      { error: "Could not load vehicle records. Please try again." },
      { status: 503 },
    );
  }
}

export async function POST(request: Request) {
  let uploadedPhoto: string | null = null;
  try {
    const user = await getAuthenticatedUser();
    if (!user) {
      return Response.json({ error: "Please sign in." }, { status: 401 });
    }
    if (user.role !== "office") {
      return Response.json(
        { error: "You do not have permission to manage vehicle records." },
        { status: 403 },
      );
    }

    await ensureCarsTable();
    const parsed = await parseCarForm(request);
    if (!parsed.ok) {
      return Response.json({ error: parsed.error }, { status: 400 });
    }

    if (parsed.photo) {
      uploadedPhoto = await saveCarPhoto(parsed.photo);
    }
    const id = await insertCar(user.id, parsed.car, uploadedPhoto);
    return Response.json({ id }, { status: 201 });
  } catch (error) {
    await cleanUpPhoto(uploadedPhoto);
    if (error instanceof CarPhotoValidationError) {
      return Response.json({ error: error.message }, { status: 400 });
    }
    if (isDuplicatePlateError(error)) {
      return Response.json(
        { error: "This license plate is already registered." },
        { status: 409 },
      );
    }

    console.error("Could not create car:", error);
    return Response.json(
      { error: "Could not save this vehicle. Please try again." },
      { status: 503 },
    );
  }
}
