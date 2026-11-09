import "server-only";

import {
  createHash,
  randomUUID,
  timingSafeEqual,
} from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
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
  direction: string;
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
  direction: string;
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
      // Tables created before the province feature lack this column: add it once.
      try {
        await getDb().query(
          "ALTER TABLE plate_detections ADD COLUMN province VARCHAR(100) NULL AFTER photo_filename",
        );
      } catch (error) {
        const code = (error as { errno?: number }).errno;
        if (code !== 1060) throw error; // 1060 = column already exists
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

/** Compare API keys in constant time (hash first so lengths always match). */
export function apiKeyIsValid(provided: string | null): boolean {
  const expected = process.env.PLATE_API_KEY;
  if (!expected || expected.length < 16 || !provided) return false;
  const a = createHash("sha256").update(provided).digest();
  const b = createHash("sha256").update(expected).digest();
  return timingSafeEqual(a, b);
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

export type ParsedDetection = {
  plate: string;
  direction: "in" | "out" | "unknown";
  device: string;
  detectedAt: Date;
  province: string | null;
};

export function parseDetectionFields(form: FormData): ParsedDetection | string {
  const plate = String(form.get("plate") ?? "").replace(/\s+/g, "").trim();
  if (plate.length < 1 || plate.length > 40) return "Invalid plate text.";

  // The Pi sends Thai words ("เข้า"/"ออก"); also accept "in"/"out".
  const rawDirection = String(form.get("direction") ?? "").trim().toLowerCase();
  const direction: "in" | "out" | "unknown" =
    rawDirection === "in" || rawDirection === "เข้า"
      ? "in"
      : rawDirection === "out" || rawDirection === "ออก"
        ? "out"
        : "unknown";

  const device = String(form.get("device") ?? "device").trim().slice(0, 60);
  if (!/^[\w.\- ]{1,60}$/.test(device)) return "Invalid device name.";

  // Pi sends "YYYY-MM-DD HH:MM:SS" (local time) or an ISO string.
  const rawTime = String(form.get("time") ?? "").trim();
  let detectedAt = new Date(rawTime.replace(" ", "T"));
  if (Number.isNaN(detectedAt.getTime())) detectedAt = new Date();
  // Province read from the plate's second line (optional, Thai text only).
  const rawProvince = String(form.get("province") ?? "").trim();
  const province = /^[\u0E00-\u0E7F ]{2,100}$/.test(rawProvince) ? rawProvince : null;
  return { plate, direction, device, detectedAt, province };
}

export async function saveDetectionPhoto(photo: File): Promise<string | null> {
  const content = Buffer.from(await photo.arrayBuffer());
  if (content.length === 0 || content.length > MAX_DETECTION_PHOTO_SIZE) {
    return null;
  }
  let extension: string;
  if (content.length >= 3 && content[0] === 0xff && content[1] === 0xd8 && content[2] === 0xff) {
    extension = "jpg";
  } else if (
    content.length >= 8 &&
    content.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))
  ) {
    extension = "png";
  } else {
    return null;
  }
  await mkdir(uploadDirectory, { recursive: true });
  const filename = `${randomUUID()}.${extension}`;
  await writeFile(join(uploadDirectory, filename), content, { flag: "wx" });
  return filename;
}

export async function insertDetection(
  userId: string,
  d: ParsedDetection,
  photoFilename: string | null,
): Promise<{ id: string; carId: string | null }> {
  const db = getDb();
  // Match against this account's registry: letters+number (spaces ignored),
  // and the province too when the Pi managed to read it.
  const plateSql = `SELECT CAST(id AS CHAR) AS id FROM cars
     WHERE user_id = ?
       AND REPLACE(CONCAT(plate_letters, plate_number), ' ', '') = ?`;
  let carId: string | null = null;
  if (d.province) {
    const [exact] = await db.execute<RowDataPacket[]>(
      `${plateSql} AND province = ? ORDER BY id LIMIT 1`,
      [userId, d.plate, d.province],
    );
    carId = exact[0]?.id ?? null;
  }
  if (!carId) {
    // Province unreadable or different: accept only when exactly one car has this plate.
    const [any] = await db.execute<RowDataPacket[]>(
      `${plateSql} ORDER BY id LIMIT 2`,
      [userId, d.plate],
    );
    if (any.length === 1) carId = any[0].id;
  }
  const [result] = await db.execute<ResultSetHeader>(
    `INSERT INTO plate_detections
       (user_id, plate_text, direction, device_id, detected_at, photo_filename, province, car_id)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    [userId, d.plate, d.direction, d.device, d.detectedAt, photoFilename, d.province, carId],
  );
  return { id: String(result.insertId), carId };
}

export async function listDetections(userId: string, limit = 50): Promise<Detection[]> {
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
  return rows.map((r) => ({
    id: r.id,
    plate: r.plate_text,
    direction: r.direction,
    device: r.device_id,
    detectedAt: r.detected_at.toISOString(),
    photoFilename: r.photo_filename,
    province: r.province,
    carProvince: r.car_province,
    matched: r.car_id !== null,
    ownerName: r.owner_name,
    brand: r.brand,
    model: r.model,
    color: r.color,
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
    throw new Error("Invalid photo name");
  }
  return readFile(join(uploadDirectory, filename));
}
