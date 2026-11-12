import { connection } from "next/server";
import { getAuthenticatedUser } from "@/lib/auth";
import {
  ensureCarsTable,
  getCarPhotoForUser,
  readCarPhoto,
} from "@/lib/cars";

type RouteContext = { params: Promise<{ id: string }> };

function isValidCarId(id: string): boolean {
  return /^[1-9]\d{0,19}$/.test(id);
}

export async function GET(_request: Request, { params }: RouteContext) {
  await connection();
  const { id } = await params;
  if (!isValidCarId(id)) {
    return Response.json({ error: "Invalid vehicle record." }, { status: 400 });
  }

  try {
    const user = await getAuthenticatedUser();
    if (!user) {
      return Response.json({ error: "Please sign in." }, { status: 401 });
    }

    await ensureCarsTable();
    const filename = await getCarPhotoForUser(user.id, id);
    if (!filename) {
      return Response.json({ error: "Photo not found." }, { status: 404 });
    }

    const image = await readCarPhoto(filename);
    const extension = filename.split(".").at(-1);
    const contentType =
      extension === "png"
        ? "image/png"
        : extension === "webp"
          ? "image/webp"
          : "image/jpeg";

    return new Response(new Uint8Array(image), {
      headers: {
        "Content-Type": contentType,
        "Cache-Control": "private, no-store",
        "X-Content-Type-Options": "nosniff",
      },
    });
  } catch (error) {
    if (
      typeof error === "object" &&
      error !== null &&
      "code" in error &&
      error.code === "ENOENT"
    ) {
      console.error("Car photo is missing from local storage:", error);
      return Response.json(
        { error: "Photo file is unavailable." },
        { status: 404 },
      );
    }

    console.error("Could not read car photo:", error);
    return Response.json(
      { error: "Could not load this photo. Please try again." },
      { status: 503 },
    );
  }
}
