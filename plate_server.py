#!/usr/bin/env python3
"""
================================================================================
 plate_server.py  -  Server + Dashboard รับผลอ่านป้ายทะเบียนจาก Raspberry Pi
================================================================================
ไฟล์เดียวจบ: รับข้อมูลจาก license_plate_ocr.py (POST /api/plates), เก็บลง SQLite,
และมีหน้า Dashboard ที่ "/" (รีเฟรชเองทุก 5 วินาที) ไม่ต้องติดตั้งโปรแกรมอื่นเพิ่ม

ติดตั้ง (บนเครื่อง server):
    pip install fastapi uvicorn python-multipart

รัน:
    export PLATE_API_KEY=รหัสลับของคุณ      # ถ้าไม่ตั้ง = ไม่ตรวจรหัส (ใช้ทดสอบเท่านั้น)
    uvicorn plate_server:app --host 0.0.0.0 --port 8000

เปิดดู Dashboard:  http://SERVER_IP:8000/

หมายเหตุด้านความปลอดภัย/ข้อมูลส่วนบุคคล:
  - ป้ายทะเบียนเป็นข้อมูลส่วนบุคคล ควรตั้ง PLATE_API_KEY และจำกัดคนเข้าถึง dashboard
  - ถ้าเปิดผ่านอินเทอร์เน็ต ควรวางหลัง HTTPS (เช่น Cloudflare Tunnel) หรือใช้ VPN
  - หน้า Dashboard นี้ไม่มีระบบล็อกอิน (ตั้ง PLATE_VIEW_KEY เพื่อบังคับให้ใส่ ?key=... ได้)
================================================================================
"""

import os
import secrets
import sqlite3
import uuid
from datetime import datetime
from pathlib import Path

from fastapi import Depends, FastAPI, File, Form, Header, HTTPException, Query, UploadFile
from fastapi.responses import HTMLResponse
from fastapi.staticfiles import StaticFiles

DATA_DIR = Path(os.environ.get("PLATE_DATA_DIR", "server_data"))
IMG_DIR = DATA_DIR / "images"
DB_PATH = DATA_DIR / "plates.db"
API_KEY = os.environ.get("PLATE_API_KEY", "")
VIEW_KEY = os.environ.get("PLATE_VIEW_KEY", "")
MAX_IMAGE_BYTES = 5 * 1024 * 1024

IMG_DIR.mkdir(parents=True, exist_ok=True)


def db():
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    return conn


with db() as c:
    c.execute("""CREATE TABLE IF NOT EXISTS plates (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        time TEXT, direction TEXT, plate TEXT, device TEXT, image TEXT,
        received_at TEXT)""")

app = FastAPI(title="Plate Dashboard")
app.mount("/images", StaticFiles(directory=IMG_DIR), name="images")


def check_api_key(x_api_key: str = Header(default="")):
    if API_KEY and not secrets.compare_digest(x_api_key, API_KEY):
        raise HTTPException(status_code=401, detail="invalid api key")


def check_view_key(key: str = Query(default="")):
    if VIEW_KEY and not secrets.compare_digest(key, VIEW_KEY):
        raise HTTPException(status_code=401, detail="view key required (?key=...)")


@app.post("/api/plates", dependencies=[Depends(check_api_key)])
async def add_plate(
    time: str = Form(...),
    direction: str = Form(""),
    plate: str = Form(""),
    device: str = Form("gate-01"),
    image: UploadFile = File(None),
):
    image_name = ""
    if image is not None:
        data = await image.read()
        if len(data) > MAX_IMAGE_BYTES:
            raise HTTPException(status_code=413, detail="image too large")
        image_name = f"{uuid.uuid4().hex}.jpg"  # ตั้งชื่อเอง กัน path traversal
        (IMG_DIR / image_name).write_bytes(data)
    with db() as c:
        cur = c.execute(
            "INSERT INTO plates (time, direction, plate, device, image, received_at) "
            "VALUES (?,?,?,?,?,?)",
            (time, direction, plate, device, image_name,
             datetime.now().strftime("%Y-%m-%d %H:%M:%S")))
    return {"ok": True, "id": cur.lastrowid}


@app.get("/api/plates", dependencies=[Depends(check_view_key)])
def list_plates(limit: int = Query(50, ge=1, le=500)):
    with db() as c:
        rows = c.execute("SELECT * FROM plates ORDER BY id DESC LIMIT ?", (limit,)).fetchall()
        total = c.execute("SELECT COUNT(*) FROM plates").fetchone()[0]
        today = datetime.now().strftime("%Y-%m-%d")
        today_n = c.execute("SELECT COUNT(*) FROM plates WHERE time LIKE ?", (today + "%",)).fetchone()[0]
        unread = c.execute("SELECT COUNT(*) FROM plates WHERE plate = ''").fetchone()[0]
    return {"total": total, "today": today_n, "unread": unread,
            "items": [dict(r) for r in rows]}


PAGE = """<!doctype html><html lang="th"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1"><title>Plate Dashboard</title>
<style>
body{font-family:system-ui,"Noto Sans Thai",sans-serif;margin:0;background:#f4f6f8;color:#1b2430}
header{background:#1f4e79;color:#fff;padding:14px 20px;font-size:20px}
.cards{display:flex;gap:12px;padding:16px 20px;flex-wrap:wrap}
.card{background:#fff;border-radius:10px;padding:12px 20px;box-shadow:0 1px 3px #0002;min-width:140px}
.card b{display:block;font-size:28px}
table{border-collapse:collapse;width:calc(100% - 40px);margin:0 20px 20px;background:#fff;border-radius:10px;overflow:hidden;box-shadow:0 1px 3px #0002}
th,td{padding:8px 12px;text-align:left;border-bottom:1px solid #e5e9ee}
th{background:#e8eef4}
img{height:48px;border-radius:4px;cursor:pointer}
.in{color:#1a7f37;font-weight:600}.out{color:#b35900;font-weight:600}.none{color:#999}
</style></head><body>
<header>Dashboard ป้ายทะเบียนรถ <small id="upd" style="font-size:13px;opacity:.8"></small></header>
<div class="cards">
<div class="card">ทั้งหมด<b id="total">-</b></div>
<div class="card">วันนี้<b id="today">-</b></div>
<div class="card">อ่านไม่ได้<b id="unread">-</b></div></div>
<table><thead><tr><th>เวลา</th><th>ป้ายทะเบียน</th><th>ทิศทาง</th><th>อุปกรณ์</th><th>ภาพ</th></tr></thead>
<tbody id="rows"></tbody></table>
<script>
const key=new URLSearchParams(location.search).get('key')||'';
const esc=s=>String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
async function load(){
  try{
    const r=await fetch('/api/plates?limit=50&key='+encodeURIComponent(key));
    if(!r.ok)throw new Error(r.status);
    const d=await r.json();
    total.textContent=d.total;today.textContent=d.today;unread.textContent=d.unread;
    rows.innerHTML=d.items.map(i=>`<tr><td>${esc(i.time)}</td>
      <td>${i.plate?esc(i.plate):'<span class=none>อ่านไม่ได้</span>'}</td>
      <td class="${i.direction=='เข้า'?'in':i.direction=='ออก'?'out':'none'}">${esc(i.direction||'-')}</td>
      <td>${esc(i.device)}</td>
      <td>${i.image?`<a href="/images/${esc(i.image)}" target="_blank"><img src="/images/${esc(i.image)}"></a>`:''}</td></tr>`).join('');
    upd.textContent='อัปเดต '+new Date().toLocaleTimeString('th-TH');
  }catch(e){upd.textContent='โหลดไม่สำเร็จ ('+e.message+')';}
}
load();setInterval(load,5000);
</script></body></html>"""


@app.get("/", response_class=HTMLResponse, dependencies=[Depends(check_view_key)])
def dashboard():
    return PAGE
