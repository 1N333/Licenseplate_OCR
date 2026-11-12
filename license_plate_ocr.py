#!/usr/bin/env python3
"""
================================================================================
 License Plate OCR สำหรับ Raspberry Pi (พร้อมโหมด Trigger เมื่อมีรถเข้า/ออก)
================================================================================
สคริปต์นี้อ่านภาพจากกล้อง (Pi Camera หรือ USB Webcam) และมี 2 โหมดหลัก:

  โหมด "live"    : อ่านภาพต่อเนื่องตลอดเวลา แล้วพยายาม OCR ทุกๆ 1 วินาที
                    (เหมาะกับการทดสอบ/ดูผลแบบ real-time)

  โหมด "trigger" : ใช้ Motion Detection (background subtraction) เฝ้าดูว่า
                    มี "วัตถุเคลื่อนที่ขนาดใหญ่" (รถ) เข้ามาในเฟรมหรือไม่
                    - ถ้ามีรถเข้ามา -> ติดตามจนกว่ารถจะออกจากเฟรม
                    - เมื่อรถออกจากเฟรมแล้ว -> เลือกเฟรมที่รถมีขนาดใหญ่ที่สุด
                      (ชัดที่สุด/ใกล้กล้องที่สุด) มา "ถ่ายภาพนิ่ง" 1 ภาพ
                    - นำภาพนิ่งนั้นไปทำ OCR หาป้ายทะเบียน
                    - บันทึกภาพ + log (วันเวลา, ทิศทางเข้า/ออก, ข้อความป้าย)
                    วิธีนี้ประหยัด CPU มาก เพราะไม่ต้อง OCR ทุกเฟรม
                    OCR เฉพาะตอนที่ "มีรถจริงๆ" ผ่านกล้องเท่านั้น

--------------------------------------------------------------------------------
การติดตั้ง (รันบน Raspberry Pi OS - Bullseye/Bookworm):
--------------------------------------------------------------------------------
    sudo apt update
    sudo apt install -y tesseract-ocr tesseract-ocr-tha libatlas-base-dev
    pip install opencv-python-headless pytesseract numpy imutils

    # ถ้าใช้ Pi Camera Module (CSI) กับ Raspberry Pi OS รุ่นใหม่ (libcamera):
    sudo apt install -y python3-picamera2
    # หรือถ้าใช้ USB Webcam ทั่วไป ไม่ต้องติดตั้ง picamera2 เพิ่ม

--------------------------------------------------------------------------------
วิธีรัน:
--------------------------------------------------------------------------------
    # โหมดถ่ายภาพต่อเนื่อง (real-time)
    python3 license_plate_ocr.py --camera usb --mode live
    python3 license_plate_ocr.py --camera pi  --mode live

    # โหมดถ่ายเฉพาะตอนมีรถเข้า/ออก (แนะนำสำหรับใช้งานจริง)
    python3 license_plate_ocr.py --camera usb --mode trigger
    python3 license_plate_ocr.py --camera pi  --mode trigger

    # ทดสอบกับไฟล์ภาพนิ่ง
    python3 license_plate_ocr.py --image test.jpg
    # เทียบกับทะเบียนที่รู้จัก (ยอมให้ผิดตัวที่หน้าตาคล้ายกัน เช่น ฬ/ฟ)
    python3 license_plate_ocr.py --image test.jpg --lang tha --known-plates known_plates.txt
    # ป้ายไทย: ให้อ่านเป็นภาษาไทยอย่างเดียว (กัน ฬม ถูกอ่านเป็น Hu)
    python3 license_plate_ocr.py --image test.jpg --lang tha

    # ส่งผลขึ้น dashboard ที่ server (ดู plate_server.py) ทุกครั้งที่มีรถผ่านในโหมด trigger
    python3 license_plate_ocr.py --camera usb --mode trigger \\
        --server-url http://SERVER_IP:8000 --api-key รหัสลับ --device-id gate-01

    การส่งขึ้น server ทำในเธรดแยก และมีคิวสำรองในเครื่อง (SQLite) ถ้าเน็ตหลุดจะเก็บไว้
    แล้วส่งใหม่อัตโนมัติเมื่อกลับมาออนไลน์ ระบบอ่านป้ายไม่สะดุด
    ต้องติดตั้งเพิ่ม: pip install requests

    กด 'q' เพื่อออกจากโปรแกรมตอนใช้กล้อง live/trigger
    ผลลัพธ์ในโหมด trigger จะถูกบันทึกไว้ในโฟลเดอร์ captures/
    พร้อมไฟล์ log.csv ที่รวมประวัติทุกครั้งที่มีรถผ่าน
================================================================================
"""

import argparse
import csv
import json
import os
import sqlite3
import threading
import time
from datetime import datetime
from pathlib import Path

import cv2
import numpy as np
import pytesseract

# --------------------------------------------------------------------------
# ค่าคงที่ / การตั้งค่า
# --------------------------------------------------------------------------

# ภาษาที่ใช้ OCR: "tha+eng" อ่านได้ทั้งเลขไทย/อักษรไทย และอังกฤษ
# ถ้าเครื่องไม่ได้ลง tesseract-ocr-tha ให้เปลี่ยนเป็น "eng" อย่างเดียว
OCR_LANG = "tha+eng"

# ขนาดพื้นที่ (พิกเซล^2) ขั้นต่ำ-สูงสุด ของ contour ที่จะถือว่าอาจเป็นป้ายทะเบียน
MIN_PLATE_AREA = 1500
MAX_PLATE_AREA = 60000

# ขนาดกล่องป้ายเทียบกับพื้นที่ทั้งภาพ (ใช้กับวิธีหาป้ายแบบที่ 2 และ 3)
REL_MIN_PLATE_AREA = 0.01   # อย่างน้อย 1% ของภาพ
REL_MAX_PLATE_AREA = 0.60   # ไม่เกิน 60% ของภาพ

# จำนวนป้ายสูงสุดที่รายงานต่อหนึ่งเฟรม (หน้าประตูมักมีรถคันเดียว ตั้งเป็น 1)
MAX_PLATES_PER_FRAME = 1

# การตัดภาพป้ายก่อน OCR
EDGE_MARGIN = 0.05            # ตัดขอบป้ายออกด้านละ 5%
TWO_LINE_ASPECT = 2.6         # กว้าง/สูง ต่ำกว่านี้ = ป้าย 2 บรรทัด (ป้ายไทยมาตรฐาน ~2.2)
TWO_LINE_TOP_FRACTION = 0.62  # ป้าย 2 บรรทัด: เอาเฉพาะ 62% ส่วนบน (บรรทัดทะเบียน)

# สัดส่วนกว้าง/สูง ของป้ายทะเบียนไทยโดยประมาณ (กว้างกว่าสูงพอสมควร)
MIN_ASPECT_RATIO = 1.5
MAX_ASPECT_RATIO = 5.5

# ขนาดพื้นที่ขั้นต่ำของ "วัตถุเคลื่อนที่" ที่จะถือว่าเป็นรถ (ปรับตามระยะกล้อง/ความละเอียด)
MIN_VEHICLE_AREA = 15000

# จำนวนเฟรมติดต่อกันที่ "ไม่เจอวัตถุ" แล้วจึงถือว่ารถออกจากเฟรมไปแล้วจริงๆ
# (กันกรณีตรวจจับหลุดไปเฟรมเดียวแล้วเข้าใจผิดว่ารถออกไปแล้ว)
EXIT_FRAMES = 10


# --------------------------------------------------------------------------
# ฟังก์ชันหาตำแหน่งป้ายทะเบียนที่เป็นไปได้ในภาพ
# --------------------------------------------------------------------------
def _boxes_from_mask(mask, frame_area, close_k):
    """ปิดช่องว่างใน mask แล้วหากล่องสี่เหลี่ยมที่ขนาดและสัดส่วนเข้าข่ายป้าย
    (ขนาดเทียบกับพื้นที่ภาพ ไม่ผูกกับความละเอียดกล้อง)"""
    kernel = cv2.getStructuringElement(cv2.MORPH_RECT, (close_k, close_k))
    mask = cv2.morphologyEx(mask, cv2.MORPH_CLOSE, kernel)
    contours, _ = cv2.findContours(mask, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)
    boxes = []
    for c in contours:
        x, y, w, h = cv2.boundingRect(c)
        if h == 0:
            continue
        box_area = w * h
        if not (REL_MIN_PLATE_AREA * frame_area <= box_area <= REL_MAX_PLATE_AREA * frame_area):
            continue
        if MIN_ASPECT_RATIO <= w / float(h) <= MAX_ASPECT_RATIO:
            boxes.append((x, y, w, h))
    return boxes


def find_plate_candidates(frame: np.ndarray):
    """
    รับภาพ BGR หนึ่งเฟรม แล้วคืนค่าเป็น list ของ bounding box (x, y, w, h)
    ที่มีลักษณะรูปทรงเข้าข่ายเป็นป้ายทะเบียน ใช้ 3 วิธีรวมกัน:
      1) ขอบภาพ (Canny) + contour พื้นที่แบบ absolute (วิธีเดิม เหมาะกับป้ายขนาดเล็กในภาพ)
      2) ขอบภาพ + ปิดช่องว่าง + ขนาดเทียบกับภาพ (ป้ายใหญ่ / ขอบขาดตอน)
      3) สีน้ำเงินของขอบ/ตัวอักษรป้าย (ป้ายตัวอย่างสีน้ำเงิน)
    กรอบที่ซ้อนกันจะถูกตัดใน process_frame ด้วย non_max_suppression_boxes
    """
    h_img, w_img = frame.shape[:2]
    frame_area = h_img * w_img

    gray = cv2.cvtColor(frame, cv2.COLOR_BGR2GRAY)
    gray = cv2.bilateralFilter(gray, 11, 17, 17)  # ลด noise แต่รักษาขอบภาพ
    edged = cv2.Canny(gray, 30, 200)

    # --- วิธีที่ 1: เดิม ---
    contours, _ = cv2.findContours(
        edged.copy(), cv2.RETR_LIST, cv2.CHAIN_APPROX_SIMPLE
    )
    contours = sorted(contours, key=cv2.contourArea, reverse=True)[:30]

    candidates = []
    for c in contours:
        area = cv2.contourArea(c)
        if area < MIN_PLATE_AREA or area > MAX_PLATE_AREA:
            continue
        x, y, w, h = cv2.boundingRect(c)
        if h == 0:
            continue
        if MIN_ASPECT_RATIO <= w / float(h) <= MAX_ASPECT_RATIO:
            candidates.append((x, y, w, h))

    # --- วิธีที่ 2: ขอบ + ปิดช่องว่าง ---
    candidates += _boxes_from_mask(edged, frame_area, close_k=5)

    # --- วิธีที่ 3: สีน้ำเงิน ---
    hsv = cv2.cvtColor(frame, cv2.COLOR_BGR2HSV)
    blue = cv2.inRange(hsv, (95, 80, 60), (130, 255, 255))
    candidates += _boxes_from_mask(blue, frame_area, close_k=25)

    return candidates


# --------------------------------------------------------------------------
# ฟังก์ชันเตรียมภาพ ROI ก่อนส่งเข้า OCR (เพิ่มความแม่นยำ)
# --------------------------------------------------------------------------
def preprocess_for_ocr(roi: np.ndarray) -> np.ndarray:
    gray = cv2.cvtColor(roi, cv2.COLOR_BGR2GRAY)

    # ขยายภาพให้ใหญ่ขึ้นช่วยให้ tesseract อ่านง่ายขึ้น
    gray = cv2.resize(gray, None, fx=2, fy=2, interpolation=cv2.INTER_CUBIC)

    # ลด noise และเพิ่ม contrast
    gray = cv2.bilateralFilter(gray, 9, 75, 75)
    _, thresh = cv2.threshold(
        gray, 0, 255, cv2.THRESH_BINARY + cv2.THRESH_OTSU
    )
    return thresh


# --------------------------------------------------------------------------
# ฟังก์ชัน OCR อ่านข้อความจากภาพ ROI ของป้ายทะเบียน
# --------------------------------------------------------------------------
def _clean(text: str) -> str:
    """เก็บเฉพาะตัวที่ป้ายทะเบียนไทยมีได้: พยัญชนะไทย (ก-ฮ), ตัวเลข (แปลงเลขไทยเป็นเลขอารบิก)
    และตัวอักษรอังกฤษ ทิ้งสระ/วรรณยุกต์ซึ่งไม่มีบนป้าย (มักเป็นขอบป้ายหรือ noise ที่ถูกอ่านผิด)"""
    out = []
    for ch in text:
        if "\u0e01" <= ch <= "\u0e2e":
            out.append(ch)
        elif ch.isdigit():
            out.append(str(int(ch)))
        elif ch.isascii() and ch.isalpha():
            out.append(ch)
    return "".join(out)


def crop_plate_text_area(roi: np.ndarray) -> np.ndarray:
    """ตัดขอบป้ายออก และถ้าเป็นป้าย 2 บรรทัด (สัดส่วนกว้าง/สูง < TWO_LINE_ASPECT)
    ให้เหลือเฉพาะบรรทัดบน (หมวดอักษร + เลขทะเบียน) ไม่เอาบรรทัดชื่อจังหวัด
    ขอบป้ายที่ติดมาในภาพมักถูก OCR เป็นตัวอักษรเกิน (เช่น แ, l, |)"""
    h, w = roi.shape[:2]
    x0, x1 = int(w * EDGE_MARGIN), int(w * (1 - EDGE_MARGIN))
    y0 = int(h * EDGE_MARGIN)
    y1 = int(h * TWO_LINE_TOP_FRACTION) if (w / float(h)) < TWO_LINE_ASPECT else int(h * (1 - EDGE_MARGIN))
    if x1 - x0 < 10 or y1 - y0 < 10:
        return roi
    return roi[y0:y1, x0:x1]


def _ocr_variants(roi: np.ndarray) -> list:
    """สร้างภาพหลายแบบจาก ROI เดียวกัน (ต่างหน้าต่างตัด/ต่างวิธีทำขาวดำ)
    เพื่ออ่านหลายรอบแล้วโหวต: การอ่านครั้งเดียวของ Tesseract ภาษาไทยแกว่งง่าย
    (ฬ ถูกอ่านเป็น ฟ/พ/ฟิม ฯลฯ) แต่ผลที่ออกบ่อยที่สุดมักใกล้เคียงของจริง"""
    h, w = roi.shape[:2]
    two_line = (w / float(h)) < TWO_LINE_ASPECT
    # (บน, ล่าง, ซ้าย, ขวา) เป็นสัดส่วนของกรอบ; ป้าย 2 บรรทัดเอาเฉพาะบรรทัดบน
    windows = ([(0.05, 0.60, 0.06, 0.94), (0.05, 0.65, 0.05, 0.95)] if two_line
               else [(0.05, 0.95, 0.05, 0.95)])
    out = []
    for y0, y1, x0, x1 in windows:
        c = roi[int(h * y0):int(h * y1), int(w * x0):int(w * x1)]
        if c.shape[0] < 10 or c.shape[1] < 10:
            continue
        gray = cv2.resize(cv2.cvtColor(c, cv2.COLOR_BGR2GRAY), None, fx=3, fy=3,
                          interpolation=cv2.INTER_CUBIC)
        # ช่องสีแดง: ตัวหนังสือสีน้ำเงินจะมืดชัด พื้นขาวสว่าง -> คอนทราสต์ดีกว่า gray
        red = cv2.resize(c[:, :, 2], None, fx=3, fy=3, interpolation=cv2.INTER_CUBIC)
        red_otsu = cv2.threshold(red, 0, 255, cv2.THRESH_BINARY + cv2.THRESH_OTSU)[1]
        out += [gray, red, red_otsu]
    return out


def _consensus(reads: list) -> str:
    """เลือกผลอ่านที่ 'อยู่กลาง' ที่สุด คือผลรวมระยะห่างถึงผลอื่นต่ำสุด"""
    best_text, best_score = "", None
    for a in reads:
        score = sum(plate_distance(a, b) for b in reads)
        if best_score is None or score < best_score:
            best_text, best_score = a, score
    return best_text


# เกณฑ์ความเชื่อมั่นของการโหวต: ป้ายจริงอ่านซ้ำแล้วได้ผลตรงกันเกือบทุกรอบ
# ส่วนกรอบที่ไม่ใช่ป้าย (ประตู ขอบกระดาษ ฯลฯ) มักอ่านได้แค่รอบสองรอบและแต่ละรอบไม่ตรงกัน
MIN_VALID_READS = 3        # ต้องมีผลอ่านที่ใช้ได้ (>=3 ตัว มีเลข) อย่างน้อยกี่รอบ
MIN_AGREEMENT = 0.6        # สัดส่วนผลอ่านที่ต้องใกล้เคียงผลโหวต (ระยะห่าง <= AGREE_DIST)
AGREE_DIST = 0.6
MAX_PLATE_CHARS = 8        # ป้ายไทยยาวสุดราว 7 ตัว (หมวด 3 + เลข 4)


def ocr_plate(roi: np.ndarray) -> str:
    """อ่านหลายรอบจากภาพหลายแบบ (psm 7) แล้วโหวตเอาผลกลาง
    ถ้าผลอ่านไม่ตรงกันพอ/มีน้อยเกินไป คืน "" (ถือว่าอ่านไม่ได้) ดีกว่าส่งข้อความมั่ว"""
    reads = []
    for variant in _ocr_variants(roi):
        text = _clean(pytesseract.image_to_string(variant, config=f"--psm 7 -l {OCR_LANG}"))
        # ป้ายไทยมีตัวเลขเสมอ และยาวอย่างน้อย 3 ตัว -> ทิ้งผลที่เป็น noise
        if len(text) >= 3 and any(ch.isdigit() for ch in text):
            reads.append(text)
    if len(reads) < MIN_VALID_READS:
        return ""
    best = _consensus(reads)
    agree = sum(1 for r in reads if plate_distance(best, r) <= AGREE_DIST)
    if len(best) > MAX_PLATE_CHARS or agree / len(reads) < MIN_AGREEMENT:
        return ""
    return best


# --------------------------------------------------------------------------
# ตัดกรอบที่ซ้อนทับกันออก (Non-Max Suppression) เหลือแค่กรอบที่ดีที่สุดต่อบริเวณ
# --------------------------------------------------------------------------
def non_max_suppression_boxes(boxes, overlap_thresh=0.3):
    """
    รับ list ของ (x, y, w, h) ที่อาจซ้อนทับกัน (เช่น contour ซ้อนกันหลายชั้น)
    คืนค่าเฉพาะกรอบที่ไม่ซ้อนทับกันเกิน overlap_thresh โดยเก็บกรอบที่ใหญ่กว่าไว้ก่อน
    """
    if not boxes:
        return []

    boxes_arr = np.array([(x, y, x + w, y + h) for (x, y, w, h) in boxes], dtype=float)
    areas = (boxes_arr[:, 2] - boxes_arr[:, 0]) * (boxes_arr[:, 3] - boxes_arr[:, 1])
    order = areas.argsort()[::-1]  # เรียงจากกรอบใหญ่ไปเล็ก

    keep = []
    while len(order) > 0:
        i = order[0]
        keep.append(i)
        rest = order[1:]

        xx1 = np.maximum(boxes_arr[i, 0], boxes_arr[rest, 0])
        yy1 = np.maximum(boxes_arr[i, 1], boxes_arr[rest, 1])
        xx2 = np.minimum(boxes_arr[i, 2], boxes_arr[rest, 2])
        yy2 = np.minimum(boxes_arr[i, 3], boxes_arr[rest, 3])

        inter_w = np.maximum(0, xx2 - xx1)
        inter_h = np.maximum(0, yy2 - yy1)
        intersection = inter_w * inter_h
        overlap = intersection / areas[rest]

        order = rest[overlap <= overlap_thresh]

    return [boxes[i] for i in keep]


# --------------------------------------------------------------------------
# ฟังก์ชันประมวลผลหนึ่งเฟรม: หา + อ่าน + วาดกรอบผลลัพธ์
# --------------------------------------------------------------------------
def process_frame(frame: np.ndarray):
    results = []
    candidates = find_plate_candidates(frame)
    candidates = non_max_suppression_boxes(candidates, overlap_thresh=0.3)

    for (x, y, w, h) in candidates:
        roi = frame[y:y + h, x:x + w]
        text = ocr_plate(roi)

        if len(text) >= 4:  # กรองผลลัพธ์ที่สั้นเกินไป (มักเป็น noise)
            results.append((text, (x, y, w, h)))

    # เก็บเฉพาะป้ายที่ใหญ่ที่สุด (ใกล้กล้องที่สุด) กรอบอื่นมักเป็นวัตถุอื่นที่ถูกอ่านเป็น noise
    results.sort(key=lambda r: r[1][2] * r[1][3], reverse=True)
    results = results[:MAX_PLATES_PER_FRAME]

    for text, (x, y, w, h) in results:
        cv2.rectangle(frame, (x, y), (x + w, y + h), (0, 255, 0), 2)
        cv2.putText(
            frame, text, (x, max(y - 10, 20)),
            cv2.FONT_HERSHEY_SIMPLEX, 0.8, (0, 255, 0), 2
        )

    return frame, results


# --------------------------------------------------------------------------
# คลาสเฝ้าดูการเคลื่อนไหว (ตรวจจับรถเข้า/ออกด้วย Background Subtraction)
# --------------------------------------------------------------------------
def frame_sharpness(frame: np.ndarray, box) -> float:
    """ความคมของบริเวณ box (ความแปรปรวนของ Laplacian) ยิ่งสูงยิ่งคม ภาพเบลอจะต่ำมาก"""
    x, y, w, h = box
    crop = frame[max(y, 0):y + h, max(x, 0):x + w]
    if crop.size == 0:
        return 0.0
    gray = cv2.cvtColor(crop, cv2.COLOR_BGR2GRAY)
    return float(cv2.Laplacian(gray, cv2.CV_64F).var())


class VehicleWatcher:
    """
    เฝ้าดูสตรีมภาพทีละเฟรม ใช้ MOG2 background subtractor หาว่ามีวัตถุขนาดใหญ่
    (สันนิษฐานว่าเป็นรถ) เคลื่อนที่เข้ามาในเฟรมหรือไม่ เมื่อรถ "ออกจากเฟรมไปแล้ว"
    จะคืนค่าเฟรมที่ชัดที่สุด (ขนาด bounding box ใหญ่ที่สุด) พร้อมทิศทางคร่าวๆ

    หมายเหตุเรื่องทิศทาง "เข้า/ออก":
      ทิศทางคำนวณจากตำแหน่ง centroid ของวัตถุตอนเริ่มเห็นเทียบกับตอนหายไปจากเฟรม
      (ซ้าย->ขวา ถือเป็น "เข้า", ขวา->ซ้าย ถือเป็น "ออก" เป็นค่าเริ่มต้น)
      ทิศทางจริงขึ้นกับว่าติดตั้งกล้องหันไปทางไหน ควรปรับ/สลับความหมายใน
      _determine_direction() ให้ตรงกับสถานที่ติดตั้งจริงของคุณ
    """

    def __init__(self, min_area=MIN_VEHICLE_AREA, exit_frames=EXIT_FRAMES):
        self.bg = cv2.createBackgroundSubtractorMOG2(
            history=500, varThreshold=40, detectShadows=True
        )
        self.min_area = min_area
        self.exit_frames = exit_frames
        self._reset()

    KEEP_FRAMES = 3  # เก็บเฟรมที่คมที่สุดไว้กี่เฟรมต่อรถหนึ่งคัน

    def _reset(self):
        self.tracking = False
        self.centroids = []
        self.best_frame = None
        self.best_area = 0
        self.frames_since_seen = 0
        self._candidates = []  # [(คะแนนความคม, เฟรม)] เรียงจากดีไปแย่
        self.last_candidates = getattr(self, "last_candidates", [])

    def _determine_direction(self):
        if len(self.centroids) < 2:
            return "ไม่ทราบทิศทาง"
        x_start = self.centroids[0][0]
        x_end = self.centroids[-1][0]
        if x_end - x_start > 30:
            return "เข้า"
        elif x_start - x_end > 30:
            return "ออก"
        return "ไม่ทราบทิศทาง"

    def update(self, frame: np.ndarray):
        """
        ป้อนเฟรมใหม่เข้ามาทีละเฟรม
        คืนค่า (event, captured_frame, direction)
          event = "captured" เมื่อเพิ่งจับภาพรถที่ผ่านไปเสร็จ 1 คัน, มิฉะนั้น None
        """
        fgmask = self.bg.apply(frame)
        fgmask = cv2.medianBlur(fgmask, 5)
        _, fgmask = cv2.threshold(fgmask, 200, 255, cv2.THRESH_BINARY)

        contours, _ = cv2.findContours(
            fgmask, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE
        )

        vehicle_box = None
        max_area = 0
        for c in contours:
            area = cv2.contourArea(c)
            if area > self.min_area and area > max_area:
                max_area = area
                vehicle_box = cv2.boundingRect(c)

        if vehicle_box is not None:
            x, y, w, h = vehicle_box
            cx, cy = x + w // 2, y + h // 2
            self.centroids.append((cx, cy))
            self.tracking = True
            self.frames_since_seen = 0
            if max_area > self.best_area:
                self.best_area = max_area
            # ให้คะแนนจาก "ความคม" ของบริเวณที่มีวัตถุเคลื่อนไหว (เฟรมที่ป้ายขยับจะเบลอ = คมต่ำ)
            # เฟรมที่ใหญ่ที่สุดมักเป็นเฟรมที่เคลื่อนไหวเร็วที่สุด จึงไม่ใช่เฟรมที่อ่านง่ายที่สุด
            score = frame_sharpness(frame, vehicle_box) * (max_area ** 0.5)
            if (len(self._candidates) < self.KEEP_FRAMES
                    or score > self._candidates[-1][0]):
                self._candidates.append((score, frame.copy()))
                self._candidates.sort(key=lambda t: t[0], reverse=True)
                del self._candidates[self.KEEP_FRAMES:]
                self.best_frame = self._candidates[0][1]
            return None, None, None

        if self.tracking:
            self.frames_since_seen += 1
            if self.frames_since_seen >= self.exit_frames:
                direction = self._determine_direction()
                frames = [f for _, f in self._candidates]
                captured = frames[0] if frames else self.best_frame
                self._reset()
                self.last_candidates = frames  # ให้ผู้เรียกลองอ่านทีละเฟรมจากคมสุดไปหา
                return "captured", captured, direction

        return None, None, None


# --------------------------------------------------------------------------
# ส่งผลขึ้น server (dashboard) ผ่านคิวสำรองใน SQLite + เธรดส่งเบื้องหลัง
# --------------------------------------------------------------------------
class ServerUploader:
    """
    - enqueue() เพียงเขียนลงคิว (เร็วมาก) จึงไม่หน่วงการอ่านป้าย
    - เธรดเบื้องหลังส่งทีละรายการไปที่ POST {server_url}/api/plates
    - ส่งไม่สำเร็จ (เน็ตหลุด/server ล่ม) จะคงไว้ในคิว แล้วลองใหม่ด้วย backoff
      สูงสุด 60 วินาที คิวเก็บอยู่ในไฟล์ จึงไม่หายแม้ปิดเครื่อง/รีสตาร์ต
    """

    def __init__(self, server_url: str, api_key: str, device_id: str, queue_db: Path,
                 path: str = "/api/plates", send_unreadable: bool = False,
                 dedupe_seconds: float = 30.0):
        self.send_unreadable = send_unreadable
        self.dedupe_seconds = dedupe_seconds
        self._last_sent = {}  # plate -> เวลา (monotonic) ที่คิวล่าสุด
        try:
            import requests  # นำเข้าตอนใช้งานจริงเท่านั้น
        except ImportError as exc:
            raise RuntimeError("ต้องติดตั้ง requests ก่อน: pip install requests") from exc
        self._requests = requests
        self.url = server_url.rstrip("/") + "/" + path.lstrip("/")
        self.api_key = api_key
        self.device_id = device_id
        queue_db.parent.mkdir(parents=True, exist_ok=True)
        self.db_path = str(queue_db)
        with self._conn() as c:
            c.execute("CREATE TABLE IF NOT EXISTS queue ("
                      "id INTEGER PRIMARY KEY AUTOINCREMENT, payload TEXT, image_path TEXT)")
        self._stop = threading.Event()
        self._wake = threading.Event()
        self._thread = threading.Thread(target=self._worker, daemon=True)
        self._thread.start()

    def _conn(self):
        # เปิดการเชื่อมต่อใหม่ทุกครั้ง เพราะ sqlite3 ห้ามข้ามเธรด
        return sqlite3.connect(self.db_path)

    def enqueue(self, timestamp: str, direction: str, plate_text: str, image_path: Path,
                province: str = ""):
        if not plate_text and not self.send_unreadable:
            return  # อ่านไม่ได้ -> ไม่ส่งขึ้น dashboard (ยังบันทึกใน log.csv/ภาพในเครื่อง)
        now = time.monotonic()
        if plate_text and self.dedupe_seconds > 0:
            key = (plate_text, province)
            last = self._last_sent.get(key)
            if last is not None and now - last < self.dedupe_seconds:
                return  # ป้ายเดิมเพิ่งส่งไป ไม่ส่งซ้ำ
            self._last_sent[key] = now
        payload = {"time": timestamp, "direction": direction,
                   "plate": plate_text or "UNREADABLE", "device": self.device_id}
        if province:
            payload["province"] = province
        with self._conn() as c:
            c.execute("INSERT INTO queue (payload, image_path) VALUES (?, ?)",
                      (json.dumps(payload, ensure_ascii=False), str(image_path)))
        self._wake.set()

    def pending(self) -> int:
        with self._conn() as c:
            return c.execute("SELECT COUNT(*) FROM queue").fetchone()[0]

    def _send(self, payload: dict, image_path: str):
        headers = {"X-API-Key": self.api_key} if self.api_key else {}
        files = {}
        fh = None
        try:
            if image_path and os.path.exists(image_path):
                fh = open(image_path, "rb")
                files["image"] = (os.path.basename(image_path), fh, "image/jpeg")
            r = self._requests.post(self.url, data=payload, files=files or None,
                                    headers=headers, timeout=10)
            r.raise_for_status()
        finally:
            if fh:
                fh.close()

    def _worker(self):
        backoff = 2
        while not self._stop.is_set():
            with self._conn() as c:
                row = c.execute("SELECT id, payload, image_path FROM queue "
                                "ORDER BY id LIMIT 1").fetchone()
            if row is None:
                self._wake.wait(timeout=5)
                self._wake.clear()
                continue
            row_id, payload, image_path = row
            try:
                self._send(json.loads(payload), image_path)
            except Exception as exc:  # เน็ตหลุด/server ผิดพลาด -> เก็บคิวไว้ ลองใหม่
                resp = getattr(exc, "response", None)
                if resp is not None and resp.status_code in (400, 413, 422):
                    # server ปฏิเสธข้อมูลนี้ถาวร (ส่งซ้ำก็ไม่ผ่าน) -> ทิ้ง ไม่ให้คิวค้างทั้งแถว
                    print(f"[WARN] server ปฏิเสธรายการนี้ ({resp.status_code}) ข้ามไป")
                    with self._conn() as c:
                        c.execute("DELETE FROM queue WHERE id = ?", (row_id,))
                    continue
                print(f"[WARN] ส่งขึ้น server ไม่สำเร็จ ({exc.__class__.__name__}) "
                      f"คิวค้าง {self.pending()} รายการ จะลองใหม่ใน {backoff} วินาที")
                self._stop.wait(backoff)
                backoff = min(backoff * 2, 60)
                continue
            backoff = 2
            with self._conn() as c:
                c.execute("DELETE FROM queue WHERE id = ?", (row_id,))

    def close(self, flush_timeout: float = 10.0):
        """รอส่งคิวที่เหลือสักครู่ก่อนปิดโปรแกรม แล้วหยุดเธรด"""
        deadline = time.time() + flush_timeout
        while self.pending() > 0 and time.time() < deadline:
            time.sleep(0.2)
        self._stop.set()
        self._wake.set()
        left = self.pending()
        if left:
            print(f"[INFO] ยังมี {left} รายการค้างในคิว จะส่งต่อเมื่อรันครั้งถัดไป")



# --------------------------------------------------------------------------
# อ่านจังหวัดจากบรรทัดล่างของป้าย (ป้ายไทย 2 บรรทัด) แล้วจับคู่กับรายชื่อ 77 จังหวัด
# --------------------------------------------------------------------------
THAI_PROVINCES = [
    "กำแพงเพชร", "เชียงราย", "เชียงใหม่", "ตาก", "นครสวรรค์", "น่าน", "พะเยา", "พิจิตร",
    "พิษณุโลก", "เพชรบูรณ์", "แพร่", "แม่ฮ่องสอน", "ลำปาง", "ลำพูน", "สุโขทัย", "อุตรดิตถ์",
    "อุทัยธานี", "กาฬสินธุ์", "ขอนแก่น", "ชัยภูมิ", "นครพนม", "นครราชสีมา", "บึงกาฬ",
    "บุรีรัมย์", "มหาสารคาม", "มุกดาหาร", "ยโสธร", "ร้อยเอ็ด", "เลย", "ศรีสะเกษ", "สกลนคร",
    "สุรินทร์", "หนองคาย", "หนองบัวลำภู", "อำนาจเจริญ", "อุดรธานี", "อุบลราชธานี",
    "กรุงเทพมหานคร", "กาญจนบุรี", "จันทบุรี", "ฉะเชิงเทรา", "ชลบุรี", "ชัยนาท", "ตราด",
    "นครนายก", "นครปฐม", "นนทบุรี", "ปทุมธานี", "ประจวบคีรีขันธ์", "ปราจีนบุรี",
    "พระนครศรีอยุธยา", "เพชรบุรี", "ระยอง", "ราชบุรี", "ลพบุรี", "สมุทรปราการ", "สมุทรสงคราม",
    "สมุทรสาคร", "สระแก้ว", "สระบุรี", "สิงห์บุรี", "สุพรรณบุรี", "อ่างทอง", "กระบี่", "ชุมพร",
    "ตรัง", "นครศรีธรรมราช", "นราธิวาส", "ปัตตานี", "พังงา", "พัทลุง", "ภูเก็ต", "ยะลา",
    "ระนอง", "สงขลา", "สตูล", "สุราษฎร์ธานี",
]
PROVINCE_MAX_COST_RATIO = 0.25   # ผิดได้ไม่เกิน 25% ของจำนวนพยัญชนะในชื่อจังหวัด
PROVINCE_MIN_VOTES = 2           # ต้องมีอย่างน้อยกี่รอบที่อ่านออกมาเป็นจังหวัดเดียวกัน


def _skeleton(text: str) -> str:
    """เหลือเฉพาะพยัญชนะไทย (ตัดสระ/วรรณยุกต์/สัญลักษณ์) เพราะ OCR มักผิดที่สระมากที่สุด"""
    return "".join(ch for ch in text if "\u0e01" <= ch <= "\u0e2e")


_PROVINCE_SKELETONS = [(p, _skeleton(p)) for p in THAI_PROVINCES]


def _substring_cost(pattern: str, text: str) -> int:
    """ระยะแก้ไขต่ำสุดระหว่าง pattern กับ 'ส่วนใดส่วนหนึ่ง' ของ text (Sellers)
    ใช้เพราะผลอ่านมักมีเศษขอบป้ายติดหน้า/ท้าย"""
    prev = [0] * (len(text) + 1)  # เริ่มต้นตรงไหนของ text ก็ได้ ไม่เสียค่า
    for i in range(1, len(pattern) + 1):
        cur = [i] + [0] * len(text)
        for j in range(1, len(text) + 1):
            cost = 0 if pattern[i - 1] == text[j - 1] else 1
            cur[j] = min(prev[j - 1] + cost, prev[j] + 1, cur[j - 1] + 1)
        prev = cur
    return min(prev)


def match_province(text: str):
    """คืน (ชื่อจังหวัด, ค่าความคลาดเคลื่อน) ที่ใกล้ที่สุด หรือ (None, None) ถ้าไม่ชัด"""
    sk = _skeleton(text)
    if len(sk) < 2:
        return None, None
    scored = []
    for name, psk in _PROVINCE_SKELETONS:
        if not psk:
            continue
        if len(psk) <= 3:
            # ชื่อสั้น (เช่น ตาก น่าน) ต้องเป็นข้อความเกือบทั้งหมด ไม่ใช่เศษที่บังเอิญอยู่ในคำยาว
            if psk in sk and len(sk) <= len(psk) + 1:
                scored.append((0.0, len(psk), name))
            continue
        ratio = _substring_cost(psk, sk) / len(psk)
        if ratio <= PROVINCE_MAX_COST_RATIO:
            scored.append((ratio, len(psk), name))
    if not scored:
        return None, None
    # เลือกที่คลาดเคลื่อนน้อยสุดก่อน ถ้าเท่ากันเลือกชื่อที่ยาวกว่า (หลักฐานมากกว่า)
    # (ผลอ่านตรงเป๊ะต้องชนะชื่อยาวที่ "เกือบตรง" เสมอ เช่น เพชรบุรี vs เพชรบูรณ์)
    scored.sort(key=lambda t: (t[0], -t[1]))
    return scored[0][2], scored[0][0]


def read_province(frame: np.ndarray, box) -> str:
    """อ่านชื่อจังหวัดจากกรอบป้าย (ทำเฉพาะป้าย 2 บรรทัด) คืน "" ถ้าอ่านไม่ได้/ไม่ชัด"""
    x, y, w, h = box
    roi = frame[y:y + h, x:x + w]
    if h == 0 or (w / float(h)) >= TWO_LINE_ASPECT:
        return ""
    H, W = roi.shape[:2]
    votes = {}
    for y0, y1, x0, x1 in [(0.55, 0.95, 0.05, 0.95), (0.50, 1.0, 0.0, 1.0)]:
        c = roi[int(H * y0):int(H * y1), int(W * x0):int(W * x1)]
        if c.shape[0] < 10 or c.shape[1] < 10:
            continue
        gray = cv2.resize(cv2.cvtColor(c, cv2.COLOR_BGR2GRAY), None, fx=3, fy=3,
                          interpolation=cv2.INTER_CUBIC)
        red = cv2.resize(c[:, :, 2], None, fx=3, fy=3, interpolation=cv2.INTER_CUBIC)
        red_otsu = cv2.threshold(red, 0, 255, cv2.THRESH_BINARY + cv2.THRESH_OTSU)[1]
        for variant in (gray, red, red_otsu):
            text = pytesseract.image_to_string(variant, config=f"--psm 7 -l {OCR_LANG}")
            name, _ = match_province(text)
            if name:
                votes[name] = votes.get(name, 0) + 1
    if not votes:
        return ""
    name, count = max(votes.items(), key=lambda kv: kv[1])
    return name if count >= PROVINCE_MIN_VOTES else ""


# --------------------------------------------------------------------------
# ฟังก์ชันบันทึกผลลัพธ์ (ภาพ + แถวใน log.csv)
# --------------------------------------------------------------------------
def read_best_of_frames(frames: list):
    """ลองอ่านทีละเฟรม (เรียงคมสุดก่อน) คืน (เฟรมที่ใช้, ภาพที่วาดกรอบ, results, จังหวัด)
    หยุดทันทีเมื่อได้ทั้งป้ายและจังหวัด ถ้าไม่ได้ครบเลย เลือกเฟรมที่ได้ป้าย/จังหวัดมากที่สุด"""
    best = None
    for frame in frames:
        annotated, results = process_frame(frame.copy())
        province = read_province(frame, results[0][1]) if results else ""
        rank = (bool(results), bool(province))
        if best is None or rank > best[0]:
            best = (rank, frame, annotated, results, province)
        if rank == (True, True):
            break
    _, frame, annotated, results, province = best
    return frame, annotated, results, province


def save_event(save_dir: Path, captured_frame: np.ndarray, direction: str,
               uploader: "ServerUploader" = None, matcher: "PlateMatcher" = None,
               alt_frames: list = None):
    save_dir.mkdir(parents=True, exist_ok=True)
    timestamp = datetime.now()
    ts_str = timestamp.strftime("%Y%m%d_%H%M%S")

    # alt_frames = เฟรมที่คมที่สุดของรถคันนี้ (เรียงดีไปแย่) ถ้าไม่มีก็ใช้เฟรมเดียว
    frames = list(alt_frames) if alt_frames else [captured_frame]
    captured_frame, annotated, results, province = read_best_of_frames(frames)
    raw_text = results[0][0] if results else ""

    # เทียบกับทะเบียนที่รู้จัก (ถ้าเปิดใช้) ใช้ทะเบียนที่จับคู่ได้เป็นผลสุดท้าย
    plate_text, match_note = raw_text, ""
    if matcher is not None and raw_text:
        matched, dist, note = matcher.match(raw_text)
        if matched:
            plate_text = matched
            match_note = "ตรง" if dist == 0 else f"ใกล้เคียง({dist:.1f})"
            if note:
                match_note += f" {note}"
        elif note == "กำกวม":
            match_note = "กำกวม"

    image_filename = f"{ts_str}_{direction}_{plate_text or 'unknown'}.jpg"
    image_path = save_dir / image_filename
    cv2.imwrite(str(image_path), annotated)

    log_path = save_dir / "log.csv"
    is_new_file = not log_path.exists()
    with open(log_path, "a", newline="", encoding="utf-8-sig") as f:
        writer = csv.writer(f)
        if is_new_file:
            writer.writerow(["timestamp", "direction", "plate_text", "image_file",
                             "ocr_raw", "match_note", "province"])
        writer.writerow([
            timestamp.strftime("%Y-%m-%d %H:%M:%S"),
            direction,
            plate_text,
            image_filename,
            raw_text,
            match_note,
            province,
        ])

    shown = f"'{plate_text or 'อ่านไม่ได้'}'"
    if raw_text and plate_text != raw_text:
        shown += f" (OCR อ่านได้ '{raw_text}' -> {match_note})"
    elif match_note:
        shown += f" ({match_note})"
    if province:
        shown += f" จังหวัด {province}"
    print(f"[{ts_str}] รถ{direction} -> ป้ายทะเบียน: {shown} "
          f"| บันทึกภาพที่: {image_path}")

    if uploader is not None:
        uploader.enqueue(timestamp.strftime("%Y-%m-%d %H:%M:%S"), direction,
                         plate_text, image_path, province)


# --------------------------------------------------------------------------
# เทียบผล OCR กับทะเบียนที่รู้จัก (ยอมให้ผิดตัวที่หน้าตาคล้ายกัน เช่น ฬ/ฟ)
# --------------------------------------------------------------------------
# กลุ่มตัวอักษรที่ OCR มักอ่านสลับกัน: สลับกันในกลุ่มเดียวกันนับเป็น "ผิดเล็กน้อย"
CONFUSABLE_GROUPS = ["ฬฟพ", "ผฝ", "ขฃ", "ชซ", "ดคต", "ถภ", "บป", "วร", "มฆ",
                     "ลส", "ฎฏ", "ยษ", "จฉ", "นห", "0O", "1Il", "2Z", "5S", "8B", "6G"]
_CONFUSABLE = {}
for _g in CONFUSABLE_GROUPS:
    for _a in _g:
        for _b in _g:
            if _a != _b:
                _CONFUSABLE[(_a, _b)] = 0.3


def plate_distance(a: str, b: str) -> float:
    """ระยะห่างระหว่างข้อความสองชุด (Levenshtein แบบถ่วงน้ำหนัก)
    แทนที่ตัวที่หน้าตาคล้ายกัน = 0.3, แทนที่ตัวอื่น/เพิ่ม/ลบ = 1.0"""
    n, m = len(a), len(b)
    prev = [float(j) for j in range(m + 1)]
    for i in range(1, n + 1):
        cur = [float(i)] + [0.0] * m
        for j in range(1, m + 1):
            if a[i - 1] == b[j - 1]:
                sub = 0.0
            else:
                sub = _CONFUSABLE.get((a[i - 1], b[j - 1]), 1.0)
            cur[j] = min(prev[j] + 1.0, cur[j - 1] + 1.0, prev[j - 1] + sub)
        prev = cur
    return prev[m]


class PlateMatcher:
    """เทียบข้อความที่ OCR อ่านได้กับรายการทะเบียนที่รู้จัก (ไฟล์ข้อความ บรรทัดละ 1 ทะเบียน
    ใส่ชื่อ/หมายเหตุต่อท้ายหลังเครื่องหมาย , ได้ เช่น  ฬม99,รถผู้อำนวยการ)

    คืนค่าทะเบียนที่ใกล้เคียงที่สุด ถ้าระยะห่าง <= threshold และชัดเจนกว่าตัวเลือกอื่น
    (ถ้ามีหลายทะเบียนใกล้เคียงพอๆ กัน ถือว่า "กำกวม" ไม่เลือกให้)"""

    def __init__(self, path, threshold=0.9, margin=0.3):
        self.threshold = threshold
        self.margin = margin
        self.plates = []      # [(ทะเบียน, หมายเหตุ)]
        with open(path, encoding="utf-8-sig") as f:
            for line in f:
                line = line.strip()
                if not line or line.startswith("#"):
                    continue
                plate, _, note = line.partition(",")
                plate = _clean(plate.replace(" ", ""))
                if plate:
                    self.plates.append((plate, note.strip()))

    def match(self, text: str):
        """คืน (ทะเบียนที่จับคู่ได้ หรือ None, ระยะห่าง, หมายเหตุ)"""
        text = _clean(text.replace(" ", ""))
        if not text or not self.plates:
            return None, None, ""
        scored = sorted((plate_distance(text, p), p, note) for p, note in self.plates)
        best = scored[0]
        if best[0] > self.threshold:
            return None, best[0], ""
        if len(scored) > 1 and scored[1][0] <= self.threshold and scored[1][0] - best[0] < self.margin:
            return None, best[0], "กำกวม"
        return best[1], best[0], best[2]


# --------------------------------------------------------------------------
# กล้องจำลอง (ไว้เทสระบบตอนยังไม่มีกล้องจริงเสียบกับบอร์ด)
# --------------------------------------------------------------------------
class SimCamera:
    """
    สร้างภาพจำลอง "ถนน + รถวิ่งผ่าน" เพื่อเทสทั้ง pipeline
    (motion detection -> trigger -> OCR) โดยไม่ต้องมีกล้องจริง

    กลไก: ในแต่ละรอบ (cycle) จะมีรถวิ่งผ่านเฟรม 1 คัน สลับทิศทางไปเรื่อยๆ
    (เข้า/ออก) โดยมี "ป้ายทะเบียนปลอม" เขียนด้วยตัวอักษร/ตัวเลข (A-Z, 0-9)
    ติดอยู่บนตัวรถ ให้ OCR อ่านได้จริง

    หมายเหตุ: cv2.putText รองรับเฉพาะตัวอักษรละติน/ตัวเลข ไม่รองรับภาษาไทย
    จึงใช้ข้อความป้ายแบบอังกฤษ+ตัวเลขในการจำลอง เป้าหมายคือทดสอบ "กลไก" ของ
    ระบบ (ตรวจจับรถ + จับเวลา + OCR) ไม่ใช่ทดสอบความแม่นยำการอ่านป้ายไทยจริง
    เมื่อมีกล้องจริงเสียบ ให้เปลี่ยนกลับไปใช้ --camera usb ได้ทันที โดยไม่ต้อง
    แก้โค้ดส่วนตรวจจับ/OCR เลย
    """

    PLATE_TEXTS = ["1กข2345", "AB1234", "9ขค8899", "CD5678"]

    def __init__(self, width=1280, height=720):
        self.width = width
        self.height = height
        self.frame_idx = 0
        self.cycle_length = 140       # จำนวนเฟรมต่อ 1 รอบ (รถเข้ามา + หายไป)
        self.car_visible_frames = 90  # จำนวนเฟรมที่เห็นรถเคลื่อนที่ในแต่ละรอบ
        self.car_w, self.car_h = 220, 120

    def _draw_road(self):
        frame = np.full((self.height, self.width, 3), (60, 60, 60), dtype=np.uint8)
        # เส้นกลางถนน
        for x in range(0, self.width, 60):
            cv2.line(frame, (x, self.height // 2), (x + 30, self.height // 2),
                      (255, 255, 255), 3)
        return frame

    def generate(self) -> np.ndarray:
        frame = self._draw_road()

        cycle_num = self.frame_idx // self.cycle_length
        cycle_pos = self.frame_idx % self.cycle_length
        direction_forward = (cycle_num % 2 == 0)  # สลับทิศทางทุกรอบ
        plate_text = self.PLATE_TEXTS[cycle_num % len(self.PLATE_TEXTS)]

        if cycle_pos < self.car_visible_frames:
            progress = cycle_pos / float(self.car_visible_frames)
            travel_range = self.width + self.car_w
            if direction_forward:
                x = int(progress * travel_range) - self.car_w
            else:
                x = int((1 - progress) * travel_range) - self.car_w
            y = self.height // 2 - self.car_h // 2

            # ตัวรถ (สี่เหลี่ยมทึบสีเข้ม)
            cv2.rectangle(frame, (x, y), (x + self.car_w, y + self.car_h),
                          (40, 40, 180), -1)

            # ป้ายทะเบียน (พื้นขาว + ข้อความดำ) ติดอยู่กลางรถ
            plate_w, plate_h = 150, 40
            px = x + (self.car_w - plate_w) // 2
            py = y + (self.car_h - plate_h) // 2
            cv2.rectangle(frame, (px, py), (px + plate_w, py + plate_h),
                          (255, 255, 255), -1)
            cv2.putText(frame, plate_text, (px + 5, py + 28),
                        cv2.FONT_HERSHEY_SIMPLEX, 0.7, (0, 0, 0), 2)

        self.frame_idx += 1
        return frame


# --------------------------------------------------------------------------
# ฟังก์ชันเปิดกล้อง (คืนค่า object สำหรับอ่านเฟรมแบบเดียวกัน ไม่ว่าจะเป็น usb/pi/sim)
# --------------------------------------------------------------------------
def open_camera(source: str, cam_index: int = 0):
    """
    คืนค่า (read_frame_fn, release_fn) เพื่อให้เรียกอ่านเฟรมได้แบบเดียวกัน
    ไม่ว่าจะใช้ USB webcam (OpenCV), Pi Camera (picamera2) หรือกล้องจำลอง (sim)
    """
    if source == "sim":
        sim = SimCamera()

        def read_frame():
            time.sleep(0.01)  # หน่วงเล็กน้อยให้พฤติกรรมใกล้เคียงกล้องจริง (~100 fps cap)
            return sim.generate()

        def release():
            pass

        return read_frame, release

    if source == "usb":
        cap = cv2.VideoCapture(cam_index)
        if not cap.isOpened():
            raise RuntimeError("ไม่สามารถเปิดกล้อง USB ได้ ตรวจสอบการเชื่อมต่อ")
        cap.set(cv2.CAP_PROP_FRAME_WIDTH, 1280)
        cap.set(cv2.CAP_PROP_FRAME_HEIGHT, 720)

        def read_frame():
            ret, frame = cap.read()
            return frame if ret else None

        def release():
            cap.release()

        return read_frame, release

    elif source == "pi":
        try:
            from picamera2 import Picamera2
        except ImportError as exc:
            raise RuntimeError(
                "ไม่พบไลบรารี picamera2 กรุณาติดตั้งด้วย: "
                "sudo apt install -y python3-picamera2"
            ) from exc

        picam2 = Picamera2()
        config = picam2.create_preview_configuration(
            main={"size": (1280, 720), "format": "RGB888"}
        )
        picam2.configure(config)
        picam2.start()
        time.sleep(2)  # รอกล้อง warm-up

        def read_frame():
            frame = picam2.capture_array()
            return cv2.cvtColor(frame, cv2.COLOR_RGB2BGR)

        def release():
            picam2.stop()

        return read_frame, release

    else:
        raise ValueError(f"ไม่รู้จักแหล่งภาพ: {source}")


# --------------------------------------------------------------------------
# โหมดที่ 1: อ่านจากไฟล์ภาพนิ่ง
# --------------------------------------------------------------------------
def run_on_image(image_path: str, matcher: "PlateMatcher" = None):
    frame = cv2.imread(image_path)
    if frame is None:
        print(f"[ERROR] ไม่พบไฟล์ภาพ: {image_path}")
        return

    frame_original = frame.copy()
    frame, results = process_frame(frame)

    for text, box in results:
        print(f"[{datetime.now().strftime('%H:%M:%S')}] อ่านป้ายทะเบียนได้: {text}")
        province = read_province(frame_original, box)
        print(f"    จังหวัด: {province or 'อ่านไม่ได้'}")
        if matcher is not None:
            matched, dist, note = matcher.match(text)
            if matched:
                print(f"    -> จับคู่กับทะเบียนที่รู้จัก: {matched}"
                      f"{' (' + note + ')' if note else ''} ระยะห่าง {dist:.1f}")
            elif note == "กำกวม":
                print("    -> ใกล้เคียงหลายทะเบียนพอๆ กัน เลือกให้ไม่ได้")
            else:
                print("    -> ไม่ตรงกับทะเบียนใดในรายการ")

    out_path = "plate_result.jpg"
    cv2.imwrite(out_path, frame)
    print(f"[INFO] บันทึกภาพผลลัพธ์ไว้ที่: {out_path}")


# --------------------------------------------------------------------------
# โหมดที่ 2: อ่านภาพต่อเนื่อง (live) จากกล้อง usb/pi
# --------------------------------------------------------------------------
def run_live_mode(source: str, cam_index: int = 0, headless: bool = False,
                   max_frames: int = None):
    read_frame, release = open_camera(source, cam_index)
    print(f"[INFO] เริ่มอ่านภาพต่อเนื่องจากกล้อง '{source}'... "
          f"{'(headless, กด Ctrl+C เพื่อออก)' if headless else 'กด q เพื่อออก'}")

    last_ocr_time = 0
    ocr_interval = 1.0  # วินาที ระหว่างการยิง OCR แต่ละครั้ง (ลดภาระ CPU)
    frame_count = 0

    try:
        while True:
            frame = read_frame()
            if frame is None:
                print("[WARN] อ่านเฟรมไม่สำเร็จ")
                break

            now = time.time()
            if now - last_ocr_time >= ocr_interval:
                frame, results = process_frame(frame)
                for text, box in results:
                    print(f"[{datetime.now().strftime('%H:%M:%S')}] อ่านป้ายทะเบียนได้: {text}")
                last_ocr_time = now

            if not headless:
                cv2.imshow("License Plate OCR - Live", frame)
                if cv2.waitKey(1) & 0xFF == ord('q'):
                    break

            frame_count += 1
            if max_frames is not None and frame_count >= max_frames:
                print(f"[INFO] ครบ {max_frames} เฟรมตามที่กำหนด หยุดการทำงาน")
                break
    finally:
        release()
        if not headless:
            cv2.destroyAllWindows()


# --------------------------------------------------------------------------
# โหมดที่ 3: ถ่ายภาพเฉพาะตอนมีรถเข้า/ออก แล้วค่อย OCR (trigger mode) - แนะนำ
# --------------------------------------------------------------------------
def run_trigger_mode(source: str, cam_index: int = 0, save_dir: str = "captures",
                      min_area: int = MIN_VEHICLE_AREA, headless: bool = False,
                      max_frames: int = None, uploader: "ServerUploader" = None,
                      matcher: "PlateMatcher" = None):
    read_frame, release = open_camera(source, cam_index)
    watcher = VehicleWatcher(min_area=min_area)
    save_path = Path(save_dir)
    frame_count = 0

    print(f"[INFO] เริ่มเฝ้าระวังรถเข้า/ออกจากกล้อง '{source}'... "
          f"{'(headless, กด Ctrl+C เพื่อออก)' if headless else 'กด q เพื่อออก'}")
    print(f"[INFO] ผลลัพธ์จะถูกบันทึกไว้ที่โฟลเดอร์: {save_path.resolve()}")

    try:
        while True:
            frame = read_frame()
            if frame is None:
                print("[WARN] อ่านเฟรมไม่สำเร็จ")
                break

            event, captured_frame, direction = watcher.update(frame)
            if event == "captured":
                save_event(save_path, captured_frame, direction, uploader, matcher,
                           alt_frames=watcher.last_candidates)

            if not headless:
                status = "กำลังติดตามรถ..." if watcher.tracking else "รอรถเข้ามา"
                cv2.putText(
                    frame, status, (20, 40),
                    cv2.FONT_HERSHEY_SIMPLEX, 0.9, (0, 255, 255), 2
                )
                cv2.imshow("License Plate OCR - Trigger Mode", frame)
                if cv2.waitKey(1) & 0xFF == ord('q'):
                    break

            frame_count += 1
            if max_frames is not None and frame_count >= max_frames:
                print(f"[INFO] ครบ {max_frames} เฟรมตามที่กำหนด หยุดการทำงาน")
                break
    finally:
        release()
        if uploader is not None:
            uploader.close()
        if not headless:
            cv2.destroyAllWindows()


# --------------------------------------------------------------------------
# Entry point
# --------------------------------------------------------------------------
def main():
    parser = argparse.ArgumentParser(
        description="OCR ป้ายทะเบียนรถยนต์บน Raspberry Pi"
    )
    parser.add_argument(
        "--camera", choices=["usb", "pi", "sim"],
        help="เลือกแหล่งภาพจากกล้อง: usb, pi หรือ sim (กล้องจำลอง ไว้เทสตอนยังไม่มีฮาร์ดแวร์)"
    )
    parser.add_argument(
        "--mode", choices=["live", "trigger"], default="trigger",
        help="live = อ่านต่อเนื่องตลอดเวลา, trigger = ถ่ายเฉพาะตอนมีรถเข้า/ออก (ค่าเริ่มต้น)"
    )
    parser.add_argument(
        "--image", type=str,
        help="พาธไฟล์ภาพนิ่งที่ต้องการทดสอบ OCR"
    )
    parser.add_argument(
        "--cam-index", type=int, default=0,
        help="index ของกล้อง USB (ค่าเริ่มต้น 0)"
    )
    parser.add_argument(
        "--save-dir", type=str, default="captures",
        help="โฟลเดอร์สำหรับบันทึกภาพ+log ในโหมด trigger (ค่าเริ่มต้น: captures)"
    )
    parser.add_argument(
        "--min-area", type=int, default=MIN_VEHICLE_AREA,
        help="ขนาดพื้นที่ขั้นต่ำของวัตถุที่ถือว่าเป็นรถ (ปรับตามระยะห่างกล้อง)"
    )
    parser.add_argument(
        "--headless", action="store_true",
        help="ปิดหน้าต่างแสดงผล (cv2.imshow) สำหรับรันบนเครื่องที่ไม่มีจอ/ไม่มี GUI"
    )
    parser.add_argument(
        "--max-frames", type=int, default=None,
        help="จำกัดจำนวนเฟรมแล้วหยุดอัตโนมัติ (มีประโยชน์เวลาเทสด้วย --camera sim)"
    )
    parser.add_argument(
        "--lang", type=str, default=os.environ.get("PLATE_OCR_LANG", OCR_LANG),
        help="ภาษา OCR ของ Tesseract: tha = ไทยอย่างเดียว (แนะนำสำหรับป้ายไทย ไม่ถูกอ่านเป็นตัวอังกฤษ), "
             "tha+eng = ไทยและอังกฤษ (ค่าเริ่มต้น), eng = อังกฤษ (หรือกำหนดด้วยตัวแปร PLATE_OCR_LANG)"
    )
    parser.add_argument(
        "--known-plates", type=str, default=os.environ.get("PLATE_KNOWN_FILE"),
        help="ไฟล์รายชื่อทะเบียนที่รู้จัก (บรรทัดละ 1 ทะเบียน, ใส่หมายเหตุหลัง , ได้) "
             "ถ้าระบุ จะเทียบผล OCR กับรายการนี้แบบยอมให้ผิดตัวที่หน้าตาคล้ายกัน (เช่น ฬ/ฟ)"
    )
    parser.add_argument(
        "--match-threshold", type=float, default=0.9,
        help="ระยะห่างสูงสุดที่ยอมให้จับคู่ (สลับตัวหน้าตาคล้าย = 0.3, ผิดตัวอื่น/ขาด/เกิน = 1.0) "
             "ค่าเริ่มต้น 0.9; ตั้งต่ำลง = เข้มงวดขึ้น"
    )
    parser.add_argument(
        "--server-url", type=str, default=os.environ.get("PLATE_SERVER_URL"),
        help="URL ของ server dashboard เช่น http://192.168.1.50:8000 (ไม่ใส่ = ไม่ส่งขึ้น server)"
    )
    parser.add_argument(
        "--api-key", type=str, default=os.environ.get("PLATE_API_KEY", ""),
        help="รหัสลับสำหรับส่งข้อมูล (ต้องตรงกับที่ตั้งไว้ใน plate_server.py)"
    )
    parser.add_argument(
        "--device-id", type=str, default=os.environ.get("PLATE_DEVICE_ID", "gate-01"),
        help="ชื่ออุปกรณ์/จุดติดตั้ง แสดงบน dashboard (ค่าเริ่มต้น gate-01)"
    )
    parser.add_argument(
        "--server-path", type=str, default=os.environ.get("PLATE_SERVER_PATH", "/api/plates"),
        help="path ของ API บน server: dashboard Next.js (CRUD_Project) ใช้ /api/detections, "
             "plate_server.py ใช้ /api/plates (ค่าเริ่มต้น)"
    )
    parser.add_argument(
        "--upload-unreadable", action="store_true",
        help="ส่งรายการที่อ่านป้ายไม่ได้ขึ้น dashboard ด้วย (ปกติไม่ส่ง)"
    )
    parser.add_argument(
        "--dedupe-seconds", type=float, default=30.0,
        help="ไม่ส่งป้ายเดิมซ้ำภายในกี่วินาที (ค่าเริ่มต้น 30; 0 = ส่งทุกครั้ง)"
    )
    args = parser.parse_args()

    globals()["OCR_LANG"] = args.lang  # ให้ฟังก์ชัน OCR ใช้ภาษาที่เลือก

    matcher = None
    if args.known_plates:
        matcher = PlateMatcher(args.known_plates, threshold=args.match_threshold)
        print(f"[INFO] โหลดทะเบียนที่รู้จัก {len(matcher.plates)} รายการจาก {args.known_plates}")

    if args.image:
        run_on_image(args.image, matcher)
    elif args.camera and args.mode == "live":
        run_live_mode(args.camera, args.cam_index, args.headless, args.max_frames)
    elif args.camera and args.mode == "trigger":
        uploader = None
        if args.server_url:
            uploader = ServerUploader(args.server_url, args.api_key, args.device_id,
                                      Path(args.save_dir) / "upload_queue.db", args.server_path,
                                      args.upload_unreadable, args.dedupe_seconds)
            print(f"[INFO] จะส่งผลขึ้น server: {args.server_url} (อุปกรณ์: {args.device_id})")
        run_trigger_mode(args.camera, args.cam_index, args.save_dir, args.min_area,
                          args.headless, args.max_frames, uploader, matcher)
    else:
        parser.print_help()


if __name__ == "__main__":
    main()
