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


PAGE = r"""<!doctype html><html lang="th"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1"><title>Plate Dashboard</title>
<style>
:root{--bg:#f4f6f8;--card:#fff;--ink:#1b2430;--mut:#6b7785;--line:#e5e9ee;--pri:#1f4e79;--in:#1a7f37;--out:#b35900}
@media (prefers-color-scheme:dark){:root{--bg:#10151b;--card:#1a222b;--ink:#e8edf2;--mut:#93a0ad;--line:#2a3541;--pri:#0f2f4d;--in:#4ac26b;--out:#f0a04b}}
body{font-family:system-ui,"Noto Sans Thai",sans-serif;margin:0;background:var(--bg);color:var(--ink)}
header{background:var(--pri);color:#fff;padding:14px 20px;font-size:20px;display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:6px}
header small{font-size:13px;opacity:.85}
.wrap{padding:16px 20px;max-width:1100px;margin:0 auto}
.cards{display:flex;gap:12px;flex-wrap:wrap;margin-bottom:14px}
.card{background:var(--card);border-radius:10px;padding:12px 20px;box-shadow:0 1px 3px #0002;min-width:130px;flex:1}
.card b{display:block;font-size:28px}
.panel{background:var(--card);border-radius:10px;padding:14px;box-shadow:0 1px 3px #0002;margin-bottom:14px}
.panel h3{margin:0 0 8px;font-size:16px}
.tools{display:flex;gap:8px;flex-wrap:wrap;margin-bottom:10px}
.tools input,.tools select,.tools button{padding:8px 10px;border:1px solid var(--line);border-radius:8px;background:var(--card);color:var(--ink);font:inherit}
.tools input{flex:1;min-width:160px}.tools button{cursor:pointer}
table{border-collapse:collapse;width:100%}
th,td{padding:8px 10px;text-align:left;border-bottom:1px solid var(--line)}
th{color:var(--mut);font-weight:600;font-size:14px}
.tw{overflow-x:auto}
img.th{height:44px;border-radius:4px;cursor:pointer}
.in{color:var(--in);font-weight:600}.out{color:var(--out);font-weight:600}.none{color:var(--mut)}
svg text{fill:var(--mut);font-size:11px}
.bar-in{fill:var(--in)}.bar-out{fill:var(--out)}
.legend{font-size:13px;color:var(--mut);margin-top:4px}.legend i{display:inline-block;width:10px;height:10px;border-radius:2px;margin:0 4px 0 10px}
</style></head><body>
<header><span>Dashboard ป้ายทะเบียนรถ</span><small id="upd"></small></header>
<div class="wrap">
<div class="cards">
 <div class="card">ทั้งหมด<b id="total">-</b></div>
 <div class="card">วันนี้<b id="today">-</b></div>
 <div class="card">เข้า (วันนี้)<b id="tin" style="color:var(--in)">-</b></div>
 <div class="card">ออก (วันนี้)<b id="tout" style="color:var(--out)">-</b></div>
 <div class="card">อ่านไม่ได้<b id="unread">-</b></div>
</div>
<div class="panel"><h3>จำนวนรถรายชั่วโมง (วันนี้)</h3><svg id="chart" viewBox="0 0 720 150" width="100%" role="img" aria-label="กราฟจำนวนรถรายชั่วโมง"></svg>
 <div class="legend"><i style="background:var(--in)"></i>เข้า<i style="background:var(--out)"></i>ออก</div></div>
<div class="panel">
 <div class="tools">
  <input id="q" placeholder="ค้นหาป้ายทะเบียน / อุปกรณ์">
  <select id="f"><option value="">ทั้งหมด</option><option>เข้า</option><option>ออก</option><option value="__none">อ่านไม่ได้</option></select>
  <button id="csv">ดาวน์โหลด CSV</button>
 </div>
 <div class="tw"><table><thead><tr><th>เวลา</th><th>ป้ายทะเบียน</th><th>ทิศทาง</th><th>อุปกรณ์</th><th>ภาพ</th></tr></thead><tbody id="rows"></tbody></table></div>
 <div class="legend" id="cnt"></div>
</div></div>
<script>
const key=new URLSearchParams(location.search).get('key')||'';
const esc=s=>String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
let all=[];
function draw(){
  const q=document.getElementById('q').value.trim().toLowerCase(), f=document.getElementById('f').value;
  const list=all.filter(i=>(!q||(i.plate||'').toLowerCase().includes(q)||(i.device||'').toLowerCase().includes(q))
    &&(!f||(f==='__none'?!i.plate:i.direction===f)));
  document.getElementById('rows').innerHTML=list.slice(0,100).map(i=>`<tr><td>${esc(i.time)}</td>
    <td>${i.plate?esc(i.plate):'<span class=none>อ่านไม่ได้</span>'}</td>
    <td class="${i.direction=='เข้า'?'in':i.direction=='ออก'?'out':'none'}">${esc(i.direction||'-')}</td>
    <td>${esc(i.device)}</td>
    <td>${i.image?`<a href="/images/${esc(i.image)}" target="_blank"><img class="th" src="/images/${esc(i.image)}"></a>`:''}</td></tr>`).join('');
  document.getElementById('cnt').textContent='แสดง '+Math.min(list.length,100)+' จาก '+list.length+' รายการที่ตรงเงื่อนไข';
}
function chart(){
  const t=new Date().toISOString().slice(0,10), loc=new Date(Date.now()-new Date().getTimezoneOffset()*60000).toISOString().slice(0,10);
  const inn=Array(24).fill(0), out=Array(24).fill(0);
  all.filter(i=>(i.time||'').startsWith(loc)).forEach(i=>{const h=parseInt((i.time||'').slice(11,13));if(h>=0&&h<24){(i.direction=='ออก'?out:inn)[h]++;}});
  const mx=Math.max(1,...inn.map((v,h)=>v+out[h])), W=720,H=150,bw=W/24;
  let s='';
  for(let h=0;h<24;h++){
    const hi=inn[h]/mx*100, ho=out[h]/mx*100, x=h*bw+3;
    s+=`<rect class="bar-out" x="${x}" y="${120-ho}" width="${bw-6}" height="${ho}" rx="2"><title>${h}:00 ออก ${out[h]}</title></rect>`;
    s+=`<rect class="bar-in" x="${x}" y="${120-ho-hi}" width="${bw-6}" height="${hi}" rx="2"><title>${h}:00 เข้า ${inn[h]}</title></rect>`;
    if(h%3==0)s+=`<text x="${x}" y="138">${h}:00</text>`;
  }
  document.getElementById('chart').innerHTML=s;
  document.getElementById('tin').textContent=inn.reduce((a,b)=>a+b,0);
  document.getElementById('tout').textContent=out.reduce((a,b)=>a+b,0);
}
async function load(){
  try{
    const r=await fetch('/api/plates?limit=500&key='+encodeURIComponent(key));
    if(!r.ok)throw new Error(r.status);
    const d=await r.json(); all=d.items;
    document.getElementById('total').textContent=d.total;document.getElementById('today').textContent=d.today;document.getElementById('unread').textContent=d.unread;
    chart();draw();
    document.getElementById('upd').textContent='อัปเดต '+new Date().toLocaleTimeString('th-TH');
  }catch(e){document.getElementById('upd').textContent='โหลดไม่สำเร็จ ('+e.message+')';}
}
document.getElementById('q').oninput=draw;document.getElementById('f').onchange=draw;
document.getElementById('csv').onclick=()=>{
  const rows=[['เวลา','ป้ายทะเบียน','ทิศทาง','อุปกรณ์']].concat(all.map(i=>[i.time,i.plate,i.direction,i.device]));
  const csv='﻿'+rows.map(r=>r.map(c=>'"'+String(c??'').replace(/"/g,'""')+'"').join(',')).join('\n');
  const a=document.createElement('a');a.href=URL.createObjectURL(new Blob([csv],{type:'text/csv'}));a.download='plates.csv';a.click();
};
load();setInterval(load,5000);
</script></body></html>
"""


@app.get("/", response_class=HTMLResponse, dependencies=[Depends(check_view_key)])
def dashboard():
    return PAGE
