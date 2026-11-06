# ระบบสแกนป้ายทะเบียนรถ (Raspberry Pi 4 + OCR + Dashboard)

อ่านป้ายทะเบียนจากกล้องด้วย OpenCV + Tesseract บน Raspberry Pi แล้วส่งขึ้น Dashboard

| ไฟล์ | หน้าที่ |
|---|---|
| `license_plate_ocr.py` | โปรแกรมหลักบน Pi: ตรวจจับรถ ถ่ายภาพ OCR บันทึก และส่งขึ้น server |
| `plate_server.py` | server (FastAPI + SQLite) และหน้า Dashboard |

## ติดตั้งบน Raspberry Pi (OS 64-bit)
```bash
sudo apt install -y tesseract-ocr tesseract-ocr-tha libatlas-base-dev python3-venv v4l-utils
python3 -m venv --system-site-packages venv
source venv/bin/activate
pip install -r requirements-pi.txt
```

## ทดสอบโดยยังไม่ต่อกล้อง
```bash
python3 license_plate_ocr.py --camera sim --mode trigger --headless --max-frames 300
```

## รันจริง
```bash
python3 license_plate_ocr.py --camera usb --mode trigger --headless
```

## Server + Dashboard
```bash
pip install -r requirements-server.txt
export PLATE_API_KEY=รหัสสำหรับส่งข้อมูล
export PLATE_VIEW_KEY=รหัสสำหรับเปิดดูหน้าเว็บ
uvicorn plate_server:app --host 0.0.0.0 --port 8000
```
เปิดดู: `http://IP-ของ-Pi:8000/?key=<PLATE_VIEW_KEY>`

ส่งผลขึ้น server:
```bash
python3 license_plate_ocr.py --camera usb --mode trigger --headless \
  --server-url http://SERVER_IP:8000 --api-key <PLATE_API_KEY> --device-id gate-01
```

## เทียบกับทะเบียนที่รู้จัก (แก้ปัญหา OCR อ่านผิดตัวที่หน้าตาคล้ายกัน เช่น ฬ/ฟ)
คัดลอก `known_plates.example.txt` เป็น `known_plates.txt` แล้วใส่ทะเบียนของคุณ (บรรทัดละ 1 ทะเบียน)
```bash
python3 license_plate_ocr.py --camera usb --mode trigger --headless --lang tha \
  --known-plates known_plates.txt
```
- สลับตัวที่หน้าตาคล้ายกัน (ฬ/ฟ/พ, ด/ต/ค, บ/ป ฯลฯ) นับเป็นผิดเล็กน้อย ยังจับคู่ได้
- ถ้ามีหลายทะเบียนใกล้เคียงพอๆ กัน จะบันทึกว่า "กำกวม" ไม่เลือกให้
- `log.csv` เก็บทั้งผลสุดท้าย (`plate_text`) และผล OCR ดิบ (`ocr_raw`) พร้อม `match_note`
- ผลที่จับคู่ได้เป็นการ "คาดเดาที่ใกล้เคียงที่สุด" ไม่ใช่การยืนยันตัวตน อย่าใช้ตัดสินสิทธิ์เข้า-ออกโดยไม่มีคนตรวจซ้ำ
- `known_plates.txt` ถูกใส่ใน `.gitignore` เพราะเป็นข้อมูลส่วนบุคคล

## หมายเหตุ
- ป้ายทะเบียนเป็นข้อมูลส่วนบุคคล (PDPA) ตั้งรหัสทั้งสองตัวและอย่าเปิดสู่อินเทอร์เน็ตโดยไม่มี HTTPS
- อย่า commit ไฟล์ `.env`, `captures/` หรือ `server_data/` (ถูกใส่ใน `.gitignore` แล้ว)
- โค้ดยังไม่ได้ทดสอบบน Raspberry Pi จริง
