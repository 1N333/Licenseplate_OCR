import "server-only";

import { createHash, randomUUID, timingSafeEqual } from "node:crypto";
import { mkdir, readFile, unlink, writeFile } from "node:fs/promises";
import { join } from "node:path";
import type { ResultSetHeader, RowDataPacket } from "mysql2";
import { ensureAuthTables } from "@/lib/auth";
import { ensureCarsTable } from "@/lib/cars";
import { getDb } from "@/lib/db";

const uploadDirectory = join(process.cwd(), "data", "uploads", "detections");
export const MAX_DETECTION_PHOTO_SIZE = 5 * 1024 * 1024;

export type Detection = {
  id: string;
  plate: string;
  direction: "in" | "out" | "unknown";
  device: string;
  detectedAt: string;
  photoFilename: string | null;
  province: string | null;
  carProvince: string | null;
  matched: boolean;
  ownerName: string | null;
  brand: string | null;
  model: string | null;
  color: string | null;
};

interface DetectionRow extends RowDataPacket {
  id: string;
  plate_text: string;
  direction: "in" | "out" | "unknown";
  device_id: string;
  detected_at: Date;
  photo_filename: string | null;
  province: string | null;
  car_province: string | null;
  car_id: string | null;
  owner_name: string | null;
  brand: string | null;
  model: string | null;
  color: string | null;
}

export type ParsedDetection = {
  plate: string;
  direction: "in" | "out" | "unknown";
  device: string;
  detectedAt: Date;
  province: string | null;
};

export class DetectionPhotoValidationError extends Error {}

let tablePromise: Promise<void> | undefined;

export async function ensureDetectionsTable(): Promise<void> {
  if (!tablePromise) {
    tablePromise = (async () => {
      await ensureAuthTables();
      await ensureCarsTable();
      await getDb().query(`
        CREATE TABLE IF NOT EXISTS plate_detections (
          id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
          user_id BIGINT UNSIGNED NOT NULL,
          plate_text VARCHAR(40) NOT NULL,
          direction VARCHAR(10) NOT NULL,
          device_id VARCHAR(60) NOT NULL,
          detected_at DATETIME NOT NULL,
          photo_filename VARCHAR(64) NULL,
          province VARCHAR(100) NULL,
          car_id BIGINT UNSIGNED NULL,
          created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
          INDEX detections_user_time_idx (user_id, detected_at),
          CONSTRAINT detections_user_fk
            FOREIGN KEY (user_id) REFERENCES auth_users(id) ON DELETE CASCADE,
          CONSTRAINT detections_car_fk
            FOREIGN KEY (car_id) REFERENCES cars(id) ON DELETE SET NULL
        )
      `);

      try {
        await getDb().query(
          "ALTER TABLE plate_detections ADD COLUMN province VARCHAR(100) NULL AFTER photo_filename",
        );
      } catch (error) {
        if (
          typeof error !== "object" ||
          error === null ||
          !("errno" in error) ||
          error.errno !== 1060
        ) {
          throw error;
        }
      }
    })();
  }

  try {
    await tablePromise;
  } catch (error) {
    tablePromise = undefined;
    throw error;
  }
}

export function apiKeyIsValid(provided: string | null): boolean {
  const expected = process.env.PLATE_API_KEY;
  if (!expected || expected.length < 16 || !provided) return false;
  const providedHash = createHash("sha256").update(provided).digest();
  const expectedHash = createHash("sha256").update(expected).digest();
  return timingSafeEqual(providedHash, expectedHash);
}

export async function getIngestUserId(): Promise<string | null> {
  const email = process.env.PLATE_OWNER_EMAIL?.trim().toLowerCase();
  if (!email) return null;

  await ensureAuthTables();
  const [rows] = await getDb().execute<RowDataPacket[]>(
    "SELECT CAST(id AS CHAR) AS id FROM auth_users WHERE email = ? LIMIT 1",
    [email],
  );
  return rows[0]?.id ?? null;
}

export function parseDetectionFields(form: FormData): ParsedDetection | string {
  const plate = String(form.get("plate") ?? "").replace(/\s+/g, "").trim();
  if (plate.length < 1 || plate.length > 40) return "Invalid plate text.";

  const rawDirection = String(form.get("direction") ?? "")
    .trim()
    .toLowerCase();
  const direction: ParsedDetection["direction"] =
    rawDirection === "in" || rawDirection === "เข้า"
      ? "in"
      : rawDirection === "out" || rawDirection === "ออก"
        ? "out"
        : "unknown";

  const device = String(form.get("device") ?? "device").trim();
  if (!/^[\w.\- ]{1,60}$/.test(device)) return "Invalid device name.";

  const rawTime = String(form.get("time") ?? "").trim();
  const detectedAt = rawTime
    ? new Date(rawTime.replace(" ", "T"))
    : new Date();
  if (Number.isNaN(detectedAt.getTime())) return "Invalid detection time.";

  const rawProvince = String(form.get("province") ?? "").trim();
  const province = /^[\u0E00-\u0E7F ]{2,100}$/.test(rawProvince)
    ? rawProvince
    : null;

  return { plate, direction, device, detectedAt, province };
}

export async function saveDetectionPhoto(photo: File): Promise<string> {
  if (photo.size === 0 || photo.size > MAX_DETECTION_PHOTO_SIZE) {
    throw new DetectionPhotoValidationError(
      "Detection photo must be 5 MB or smaller.",
    );
  }

  const content = Buffer.from(await photo.arrayBuffer());
  if (content.length === 0 || content.length > MAX_DETECTION_PHOTO_SIZE) {
    throw new DetectionPhotoValidationError(
      "Detection photo must be 5 MB or smaller.",
    );
  }

  let extension: "jpg" | "png";
  if (
    photo.type === "image/jpeg" &&
    content.length >= 3 &&
    content[0] === 0xff &&
    content[1] === 0xd8 &&
    content[2] === 0xff
  ) {
    extension = "jpg";
  } else if (
    photo.type === "image/png" &&
    content.length >= 8 &&
    content.subarray(0, 8).equals(
      Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    )
  ) {
    extension = "png";
  } else {
    throw new DetectionPhotoValidationError(
      "Upload a valid JPEG or PNG detection photo.",
    );
  }

  await mkdir(uploadDirectory, { recursive: true });
  const filename = `${randomUUID()}.${extension}`;
  await writeFile(join(uploadDirectory, filename), content, { flag: "wx" });
  return filename;
}

export async function removeDetectionPhoto(filename: string): Promise<void> {
  await unlink(join(uploadDirectory, filename));
}

export async function insertDetection(
  userId: string,
  detection: ParsedDetection,
  photoFilename: string | null,
): Promise<{ id: string; matched: boolean }> {
  const db = getDb();
  const plateQuery = `SELECT CAST(id AS CHAR) AS id FROM cars
    WHERE user_id = ?
      AND REPLACE(CONCAT(plate_letters, plate_number), ' ', '') = ?`;
  let carId: string | null = null;

  if (detection.province) {
    const [matchingCars] = await db.execute<RowDataPacket[]>(
      `${plateQuery} AND province = ? ORDER BY id LIMIT 1`,
      [userId, detection.plate, detection.province],
    );
    carId = matchingCars[0]?.id ?? null;
  }

  if (!carId) {
    const [matchingCars] = await db.execute<RowDataPacket[]>(
      `${plateQuery} ORDER BY id LIMIT 2`,
      [userId, detection.plate],
    );
    if (matchingCars.length === 1) carId = matchingCars[0].id;
  }

  const [result] = await db.execute<ResultSetHeader>(
    `INSERT INTO plate_detections
       (user_id, plate_text, direction, device_id, detected_at, photo_filename, province, car_id)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      userId,
      detection.plate,
      detection.direction,
      detection.device,
      detection.detectedAt,
      photoFilename,
      detection.province,
      carId,
    ],
  );
  return { id: String(result.insertId), matched: carId !== null };
}

export async function listDetections(
  userId: string,
  limit = 50,
): Promise<Detection[]> {
  const safeLimit = Math.min(Math.max(Math.trunc(limit) || 50, 1), 200);
  const [rows] = await getDb().execute<DetectionRow[]>(
    `SELECT CAST(p.id AS CHAR) AS id, p.plate_text, p.direction, p.device_id,
            p.detected_at, p.photo_filename, p.province, CAST(p.car_id AS CHAR) AS car_id,
            c.owner_name, c.brand, c.model, c.color, c.province AS car_province
     FROM plate_detections p
     LEFT JOIN cars c ON c.id = p.car_id
     WHERE p.user_id = ?
     ORDER BY p.detected_at DESC, p.id DESC
     LIMIT ${safeLimit}`,
    [userId],
  );

  return rows.map((row) => ({
    id: row.id,
    plate: row.plate_text,
    direction: row.direction,
    device: row.device_id,
    detectedAt: row.detected_at.toISOString(),
    photoFilename: row.photo_filename,
    province: row.province,
    carProvince: row.car_province,
    matched: row.car_id !== null,
    ownerName: row.owner_name,
    brand: row.brand,
    model: row.model,
    color: row.color,
  }));
}

export async function getDetectionPhotoForUser(
  userId: string,
  id: string,
): Promise<string | null> {
  const [rows] = await getDb().execute<RowDataPacket[]>(
    "SELECT photo_filename FROM plate_detections WHERE id = ? AND user_id = ? LIMIT 1",
    [id, userId],
  );
  return rows[0]?.photo_filename ?? null;
}

export async function readDetectionPhoto(filename: string): Promise<Buffer> {
  if (!/^[0-9a-f-]{36}\.(jpg|png)$/.test(filename)) {
    throw new Error("Invalid detection photo filename.");
  }
  return readFile(join(uploadDirectory, filename));
}
