#!/usr/bin/env bash
# เริ่มโปรแกรมอ่านป้ายทะเบียน: อ่านค่าจาก plate-station.env แล้วรันเอง ไม่ต้องพิมพ์พารามิเตอร์
set -u
DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$DIR" || exit 1

CONF="${PLATE_CONF:-$DIR/plate-station.env}"
if [ ! -f "$CONF" ]; then echo "[ERROR] ไม่พบไฟล์ตั้งค่า $CONF"; exit 1; fi
set -a; . "$CONF"; set +a

if [ -z "${PLATE_SERVER_URL:-}" ] || [ "${PLATE_API_KEY:-}" = "ใส่รหัสลับตรงนี้" ] || [ -z "${PLATE_API_KEY:-}" ]; then
  echo "[ERROR] ยังไม่ได้ตั้ง PLATE_SERVER_URL / PLATE_API_KEY ใน $CONF"; exit 1
fi

# ใช้ virtualenv ถ้ามี
for v in venv .venv; do
  if [ -f "$DIR/$v/bin/activate" ]; then . "$DIR/$v/bin/activate"; break; fi
done

# รอเครือข่าย/เวลาให้พร้อม (สูงสุด ~60 วินาที) ไม่บล็อกตลอดไปถ้า Dashboard ยังไม่เปิด
for i in $(seq 1 30); do
  if curl -s -o /dev/null --max-time 2 "$PLATE_SERVER_URL"; then break; fi
  [ "$i" = 1 ] && echo "[INFO] รอเชื่อมต่อ Dashboard ที่ $PLATE_SERVER_URL ..."
  sleep 2
done

ARGS=(--camera usb --mode trigger --cam-index "${CAM_INDEX:-0}" --save-dir "$DIR/captures" --lang "${PLATE_OCR_LANG:-tha+eng}")
if [ "${HEADLESS:-1}" = "1" ] || [ -z "${DISPLAY:-}" ]; then ARGS+=(--headless); fi
if [ -n "${PLATE_KNOWN_FILE:-}" ] && [ -f "$PLATE_KNOWN_FILE" ]; then ARGS+=(--known-plates "$PLATE_KNOWN_FILE"); fi

# ส่งต่อพารามิเตอร์ที่ได้จาก environment (โปรแกรมอ่าน PLATE_SERVER_URL, PLATE_API_KEY,
# PLATE_DEVICE_ID, PLATE_SERVER_PATH เองอยู่แล้ว)
echo "[INFO] เริ่มระบบ: กล้อง index ${CAM_INDEX:-0} -> $PLATE_SERVER_URL (${PLATE_DEVICE_ID:-gate-01})"
exec python3 "$DIR/license_plate_ocr.py" "${ARGS[@]}"
