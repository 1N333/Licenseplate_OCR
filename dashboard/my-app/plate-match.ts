// จับคู่ทะเบียนที่ OCR อ่านได้กับทะเบียนที่ลงทะเบียนไว้ โดยยอมให้ผิดตัวที่หน้าตาคล้ายกัน
// (เช่น ท/ห) กลุ่มตัวอักษรเดียวกับฝั่ง Raspberry Pi (license_plate_ocr.py: CONFUSABLE_GROUPS)

const CONFUSABLE_GROUPS = [
  "ฬฟพ", "ผฝ", "ขฃ", "ชซ", "ดคต", "ถภ", "บป", "วร", "มฆ", "ลส", "ฎฏ", "ยษ", "จฉ",
  "นห", "ทหฑ", "0O", "1Il", "2Z", "5S", "8B", "6G",
];
const CONFUSABLE_COST = 0.3;

const confusable = new Set<string>();
for (const group of CONFUSABLE_GROUPS) {
  for (const a of group) for (const b of group) if (a !== b) confusable.add(a + b);
}

export function normalizePlate(value: string): string {
  return value.replace(/\s+/g, "");
}

export function plateDistance(a: string, b: string): number {
  const x = [...a];
  const y = [...b];
  let prev = Array.from({ length: y.length + 1 }, (_, j) => j);
  for (let i = 1; i <= x.length; i++) {
    const cur = [i, ...Array<number>(y.length).fill(0)];
    for (let j = 1; j <= y.length; j++) {
      const sub =
        x[i - 1] === y[j - 1]
          ? 0
          : confusable.has(x[i - 1] + y[j - 1])
            ? CONFUSABLE_COST
            : 1;
      cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + sub);
    }
    prev = cur;
  }
  return prev[y.length];
}

export type RegisteredPlate = {
  id: string;
  plate: string; // หมวดอักษร + เลข ไม่มีเว้นวรรค
  province: string;
};

const digitsOf = (value: string) => value.replace(/\D/g, "");

/**
 * หารถที่ลงทะเบียนไว้ซึ่งใกล้เคียงกับผล OCR ที่สุด เงื่อนไขเข้มเพื่อไม่ให้จับคู่ผิดคัน:
 * - ตัวเลขทะเบียนต้องตรงทุกหลัก
 * - ถ้า OCR อ่านจังหวัดได้ ต้องเป็นจังหวัดเดียวกับรถคันนั้น
 * - ระยะห่างตัวอักษรไม่เกิน 0.9 (หรือ 1.3 ถ้าจังหวัดตรงกันด้วย)
 * - ต้องมีคันเดียวที่ดีที่สุด ห่างจากคันอื่นอย่างน้อย 0.3
 */
export function findFuzzyCar(
  detectedPlate: string,
  detectedProvince: string | null,
  cars: RegisteredPlate[],
): string | null {
  const plate = normalizePlate(detectedPlate);
  const digits = digitsOf(plate);
  if (!plate || !digits) return null;

  const scored: { id: string; distance: number }[] = [];
  for (const car of cars) {
    const carPlate = normalizePlate(car.plate);
    if (digitsOf(carPlate) !== digits) continue;
    const provinceKnown = detectedProvince !== null;
    if (provinceKnown && car.province !== detectedProvince) continue;
    const distance = plateDistance(plate, carPlate);
    const limit = provinceKnown ? 1.3 : 0.9;
    if (distance <= limit) scored.push({ id: car.id, distance });
  }
  scored.sort((a, b) => a.distance - b.distance);
  if (scored.length === 0) return null;
  if (scored.length > 1 && scored[1].distance - scored[0].distance < 0.3) return null;
  return scored[0].id;
}
