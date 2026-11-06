import "server-only";

import { randomUUID } from "node:crypto";
import { mkdir, readFile, unlink, writeFile } from "node:fs/promises";
import { join } from "node:path";
import type { ResultSetHeader, RowDataPacket } from "mysql2";
import { getDb } from "@/lib/db";

export const MAX_CAR_PHOTO_SIZE = 5 * 1024 * 1024;
const uploadDirectory = join(process.cwd(), "data", "uploads", "cars");

export type CarInput = {
  plateLetters: string;
  plateNumber: string;
  province: string;
  ownerName: string;
  ownerPhone: string;
  brand: string;
  model: string;
  color: string;
};

export type CarRecord = CarInput & {
  id: string;
  photoFilename: string | null;
  createdAt: string;
};

export type ParsedCarForm =
  | { ok: true; car: CarInput; photo: File | null; removePhoto: boolean }
  | { ok: false; error: string };

export interface CarRow extends RowDataPacket {
  id: string;
  plate_letters: string;
  plate_number: string;
  province: string;
  owner_name: string;
  owner_phone: string;
  brand: string;
  model: string;
  color: string;
  photo_filename: string | null;
  created_at: Date;
}

interface CarPhotoRow extends RowDataPacket {
  photo_filename: string | null;
}

export class CarPhotoValidationError extends Error {}

let carsTablePromise: Promise<void> | undefined;

export async function ensureCarsTable(): Promise<void> {
  if (!carsTablePromise) {
    carsTablePromise = getDb()
      .query(`
        CREATE TABLE IF NOT EXISTS cars (
          id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
          user_id BIGINT UNSIGNED NOT NULL,
          plate_letters VARCHAR(20) NOT NULL,
          plate_number VARCHAR(10) NOT NULL,
          province VARCHAR(100) NOT NULL,
          owner_name VARCHAR(150) NOT NULL,
          owner_phone VARCHAR(30) NOT NULL,
          brand VARCHAR(100) NOT NULL,
          model VARCHAR(100) NOT NULL,
          color VARCHAR(50) NOT NULL,
          photo_filename VARCHAR(64) NULL,
          created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
          updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
          UNIQUE KEY cars_user_plate_unique (user_id, plate_letters, plate_number, province),
          INDEX cars_user_id_idx (user_id),
          CONSTRAINT cars_user_id_fk
            FOREIGN KEY (user_id) REFERENCES auth_users(id) ON DELETE CASCADE
        )
      `)
      .then(() => undefined);
  }

  try {
    await carsTablePromise;
  } catch (error) {
    carsTablePromise = undefined;
    throw error;
  }
}

export async function parseCarForm(request: Request): Promise<ParsedCarForm> {
  let form: FormData;
  try {
    form = await request.formData();
  } catch {
    return { ok: false, error: "Could not read the submitted form." };
  }

  const getText = (key: string) => {
    const value = form.get(key);
    return typeof value === "string" ? value.trim() : "";
  };
  const submittedPlate = getText("plate");
  let plateLetters = getText("plateLetters");
  let plateNumber = getText("plateNumber");
  if (submittedPlate) {
    const plateMatch = submittedPlate.match(
      /^(?:([ก-ฮ0-9]{2})\s*([0-9]{1,4})|([0-9]{1,4})\s*([ก-ฮ0-9]{2}))$/,
    );
    if (!plateMatch) {
      return {
        ok: false,
        error:
          "Invalid license plate format.",
      };
    }
    plateLetters = plateMatch[1] ?? plateMatch[4];
    plateNumber = plateMatch[2] ?? plateMatch[3];
  }

  const car: CarInput = {
    plateLetters,
    plateNumber,
    province: getText("province"),
    ownerName: getText("ownerName"),
    ownerPhone: getText("ownerPhone"),
    brand: getText("brand"),
    model: getText("model"),
    color: getText("color") === "__custom__"
      ? getText("customColor")
      : getText("color"),
  };

  if (Object.values(car).some((value) => !value)) {
    return { ok: false, error: "Please fill in all vehicle and owner fields." };
  }
  if (
    !/^(?=[ก-ฮ0-9]{2}$)(?=.*[ก-ฮ])[ก-ฮ0-9]{2}$/u.test(car.plateLetters)
  ) {
    return {
      ok: false,
      error: "Plate category must contain 2 characters including a Thai letter.",
    };
  }
  if (!/^\d{1,4}$/.test(car.plateNumber)) {
    return { ok: false, error: "Plate number must contain 1 to 4 digits." };
  }
  if (
    car.ownerPhone.length > 30 ||
    !/^[0-9+()\-\s]{8,30}$/.test(car.ownerPhone)
  ) {
    return {
      ok: false,
      error: "Enter a valid owner phone number (8 to 30 characters).",
    };
  }
  if (
    car.province.length > 100 ||
    car.ownerName.length > 150 ||
    car.brand.length > 100 ||
    car.model.length > 100 ||
    car.color.length > 50
  ) {
    return { ok: false, error: "One or more fields are invalid or too long." };
  }

  const photoEntry = form.get("photo");
  if (photoEntry !== null && !(photoEntry instanceof File)) {
    return { ok: false, error: "The uploaded photo is invalid." };
  }

  const photo =
    photoEntry instanceof File && photoEntry.size > 0 ? photoEntry : null;
  if (photo && photo.size > MAX_CAR_PHOTO_SIZE) {
    return { ok: false, error: "Photo must be 5 MB or smaller." };
  }
  const removePhoto = getText("removePhoto") === "true";
  if (photo && removePhoto) {
    return { ok: false, error: "Choose a new photo or remove the current one." };
  }

  return {
    ok: true,
    car,
    photo,
    removePhoto,
  };
}

export async function saveCarPhoto(photo: File): Promise<string> {
  const content = Buffer.from(await photo.arrayBuffer());
  if (content.length > MAX_CAR_PHOTO_SIZE) {
    throw new CarPhotoValidationError("Photo must be 5 MB or smaller.");
  }

  let extension: string;
  if (
    content.length >= 8 &&
    content.subarray(0, 8).equals(
      Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    ) &&
    photo.type === "image/png"
  ) {
    extension = "png";
  } else if (
    content.length >= 3 &&
    content[0] === 0xff &&
    content[1] === 0xd8 &&
    content[2] === 0xff &&
    photo.type === "image/jpeg"
  ) {
    extension = "jpg";
  } else if (
    content.length >= 12 &&
    content.toString("ascii", 0, 4) === "RIFF" &&
    content.toString("ascii", 8, 12) === "WEBP" &&
    photo.type === "image/webp"
  ) {
    extension = "webp";
  } else {
    throw new CarPhotoValidationError("Upload a valid JPEG, PNG, or WebP image.");
  }

  await mkdir(uploadDirectory, { recursive: true });
  const filename = `${randomUUID()}.${extension}`;
  await writeFile(join(uploadDirectory, filename), content, { flag: "wx" });
  return filename;
}

export async function removeCarPhoto(filename: string): Promise<void> {
  await unlink(join(uploadDirectory, filename));
}

export async function listCarsForUser(userId: string): Promise<CarRecord[]> {
  const [rows] = await getDb().execute<CarRow[]>(
    `SELECT CAST(id AS CHAR) AS id, plate_letters, plate_number, province,
            owner_name, owner_phone, brand, model, color, photo_filename,
            created_at
     FROM cars
     WHERE user_id = ?
     ORDER BY created_at DESC, id DESC`,
    [userId],
  );

  return rows.map((row) => ({
    id: row.id,
    plateLetters: row.plate_letters,
    plateNumber: row.plate_number,
    province: row.province,
    ownerName: row.owner_name,
    ownerPhone: row.owner_phone,
    brand: row.brand,
    model: row.model,
    color: row.color,
    photoFilename: row.photo_filename,
    createdAt: row.created_at.toISOString(),
  }));
}

export async function insertCar(
  userId: string,
  car: CarInput,
  photoFilename: string | null,
): Promise<string> {
  const [result] = await getDb().execute<ResultSetHeader>(
    `INSERT INTO cars
      (user_id, plate_letters, plate_number, province, owner_name, owner_phone,
       brand, model, color, photo_filename)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      userId,
      car.plateLetters,
      car.plateNumber,
      car.province,
      car.ownerName,
      car.ownerPhone,
      car.brand,
      car.model,
      car.color,
      photoFilename,
    ],
  );
  return String(result.insertId);
}

export async function updateCar(
  userId: string,
  carId: string,
  car: CarInput,
  photoFilename: string | null | undefined,
): Promise<{ affectedRows: number; oldPhotoFilename: string | null }> {
  const [rows] = await getDb().execute<CarPhotoRow[]>(
    "SELECT photo_filename FROM cars WHERE id = ? AND user_id = ? LIMIT 1",
    [carId, userId],
  );
  const current = rows[0];
  if (!current) {
    return { affectedRows: 0, oldPhotoFilename: null };
  }
  const updatedPhotoFilename =
    photoFilename === undefined ? current.photo_filename : photoFilename;

  await getDb().execute(
    `UPDATE cars
     SET plate_letters = ?, plate_number = ?, province = ?, owner_name = ?,
         owner_phone = ?, brand = ?, model = ?, color = ?,
         photo_filename = ?
     WHERE id = ? AND user_id = ?`,
    [
      car.plateLetters,
      car.plateNumber,
      car.province,
      car.ownerName,
      car.ownerPhone,
      car.brand,
      car.model,
      car.color,
      updatedPhotoFilename,
      carId,
      userId,
    ],
  );

  if (
    current.photo_filename &&
    current.photo_filename !== updatedPhotoFilename
  ) {
    return { affectedRows: 1, oldPhotoFilename: current.photo_filename };
  }
  return { affectedRows: 1, oldPhotoFilename: null };
}

export async function deleteCar(
  userId: string,
  carId: string,
): Promise<string | null | undefined> {
  const [rows] = await getDb().execute<CarPhotoRow[]>(
    "SELECT photo_filename FROM cars WHERE id = ? AND user_id = ? LIMIT 1",
    [carId, userId],
  );
  if (!rows[0]) {
    return undefined;
  }

  await getDb().execute("DELETE FROM cars WHERE id = ? AND user_id = ?", [
    carId,
    userId,
  ]);
  return rows[0].photo_filename;
}

export async function getCarPhotoForUser(
  userId: string,
  carId: string,
): Promise<string | null | undefined> {
  const [rows] = await getDb().execute<CarPhotoRow[]>(
    "SELECT photo_filename FROM cars WHERE id = ? AND user_id = ? LIMIT 1",
    [carId, userId],
  );
  return rows[0]?.photo_filename;
}

export async function readCarPhoto(filename: string): Promise<Buffer> {
  return readFile(join(uploadDirectory, filename));
}
