# ส่งป้ายทะเบียนจาก Pi เข้า Dashboard (CRUD_Project)

## ฝั่ง Dashboard (คอมที่รัน Next.js)
1. `cd dashboard/my-app` แล้วรัน `(รวมอยู่ในโฟลเดอร์ dashboard/ แล้ว ไม่ต้อง apply patch)`
2. เพิ่มใน `my-app/.env` (หรือ .env.local):
   ```
   PLATE_API_KEY=<สุ่มยาว ๆ: openssl rand -hex 24>
   PLATE_OWNER_EMAIL=<อีเมลที่สมัครไว้ใน dashboard>
   ```
   ป้ายที่ส่งมาจะถูกบันทึกในบัญชีนี้ และเทียบกับรถที่ลงทะเบียนไว้ในบัญชีเดียวกัน
3. รัน `npm run dev -- -H 0.0.0.0` (ให้ Pi เข้าถึงได้) แล้ว login จะเห็นตาราง "ป้ายทะเบียนที่ตรวจจับได้" ใต้ตารางรถ
   ตาราง `plate_detections` จะถูกสร้างอัตโนมัติ

## ฝั่ง Pi
อัปเดต `license_plate_ocr.py` แล้วรัน:
```
python3 license_plate_ocr.py --camera usb --mode trigger --headless --lang tha \
  --known-plates known_plates.txt \
  --server-url http://IP_คอม_DASHBOARD:3000 --server-path /api/detections \
  --api-key <ค่าเดียวกับ PLATE_API_KEY> --device-id gate-01
```
ถ้าใช้ systemd ให้ใส่ `PLATE_SERVER_URL`, `PLATE_SERVER_PATH=/api/detections`, `PLATE_API_KEY` ใน `/etc/plate.env`

ทดสอบเร็ว ๆ จากคอมใดก็ได้:
```
curl -X POST http://IP:3000/api/detections -H "X-API-Key: <key>" \
  -F plate=1กข2345 -F direction=in -F device=gate-01
```
