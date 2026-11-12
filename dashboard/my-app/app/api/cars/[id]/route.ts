import { getAuthenticatedUser } from "@/lib/auth";
import {
  CarPhotoValidationError,
  deleteCar,
  ensureCarsTable,
  parseCarForm,
  removeCarPhoto,
  saveCarPhoto,
  updateCar,
} from "@/lib/cars";

type RouteContext = { params: Promise<{ id: string }> };

function isValidCarId(id: string): boolean {
  return /^[1-9]\d{0,19}$/.test(id);
}

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

export async function PATCH(request: Request, { params }: RouteContext) {
  const { id } = await params;
  if (!isValidCarId(id)) {
    return Response.json({ error: "Invalid vehicle record." }, { status: 400 });
  }

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

    const result = await updateCar(
      user.id,
      id,
      parsed.car,
      parsed.removePhoto ? null : uploadedPhoto ?? undefined,
    );
    if (result.affectedRows === 0) {
      await cleanUpPhoto(uploadedPhoto);
      return Response.json({ error: "Vehicle record not found." }, { status: 404 });
    }

    await cleanUpPhoto(result.oldPhotoFilename);
    return Response.json({ success: true });
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

    console.error("Could not update car:", error);
    return Response.json(
      { error: "Could not update this vehicle. Please try again." },
      { status: 503 },
    );
  }
}

export async function DELETE(_request: Request, { params }: RouteContext) {
  const { id } = await params;
  if (!isValidCarId(id)) {
    return Response.json({ error: "Invalid vehicle record." }, { status: 400 });
  }

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
    const photoFilename = await deleteCar(user.id, id);
    if (photoFilename === undefined) {
      return Response.json({ error: "Vehicle record not found." }, { status: 404 });
    }

    await cleanUpPhoto(photoFilename);
    return Response.json({ success: true });
  } catch (error) {
    console.error("Could not delete car:", error);
    return Response.json(
      { error: "Could not delete this vehicle. Please try again." },
      { status: 503 },
    );
  }
}
