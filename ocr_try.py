#!/usr/bin/env python3
"""
ocr_try.py - ลองอ่านป้ายจากภาพเดียวด้วยหลายวิธี เพื่อดูว่าวิธีไหนอ่านถูก (เช่น ฬม ไม่ใช่ ฟม)

วิธีใช้ (บน Pi ในโฟลเดอร์ ~/plate หลัง source venv/bin/activate):
    python3 ocr_try.py captures/ชื่อไฟล์.jpg
    python3 ocr_try.py captures/ชื่อไฟล์.jpg --lang tha

ผลลัพธ์เป็นตาราง: วิธีเตรียมภาพ x โหมดอ่าน -> ข้อความที่ได้ แล้วส่งตารางนี้กลับมาให้ดู
"""
import argparse
import sys

import cv2
import pytesseract

import license_plate_ocr as m


def variants(crop):
    gray = cv2.cvtColor(crop, cv2.COLOR_BGR2GRAY)
    out = {}
    for scale in (2, 3, 4):
        g = cv2.resize(gray, None, fx=scale, fy=scale, interpolation=cv2.INTER_CUBIC)
        out[f"x{scale}-gray"] = g
        out[f"x{scale}-otsu"] = cv2.threshold(cv2.bilateralFilter(g, 9, 75, 75), 0, 255,
                                              cv2.THRESH_BINARY + cv2.THRESH_OTSU)[1]
        out[f"x{scale}-adaptive"] = cv2.adaptiveThreshold(
            g, 255, cv2.ADAPTIVE_THRESH_GAUSSIAN_C, cv2.THRESH_BINARY, 51, 15)
        # ช่องสีแดงของภาพ: ตัวอักษรสีน้ำเงินจะเข้มชัดขึ้นเมื่อเทียบกับพื้นเทา
        red = cv2.resize(crop[:, :, 2], None, fx=scale, fy=scale, interpolation=cv2.INTER_CUBIC)
        out[f"x{scale}-red-otsu"] = cv2.threshold(red, 0, 255, cv2.THRESH_BINARY + cv2.THRESH_OTSU)[1]
    return out


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("image")
    ap.add_argument("--lang", default="tha")
    args = ap.parse_args()

    frame = cv2.imread(args.image)
    if frame is None:
        sys.exit(f"ไม่พบไฟล์ภาพ: {args.image}")

    boxes = m.non_max_suppression_boxes(m.find_plate_candidates(frame), 0.3)
    if not boxes:
        sys.exit("ไม่พบป้ายในภาพ")
    x, y, w, h = max(boxes, key=lambda b: b[2] * b[3])
    print(f"ป้ายที่พบ: x={x} y={y} w={w} h={h}  (ภาษา: {args.lang})")
    crop = m.crop_plate_text_area(frame[y:y + h, x:x + w])
    cv2.imwrite("ocr_try_crop.png", crop)
    print("บันทึกภาพส่วนที่ใช้อ่านไว้ที่ ocr_try_crop.png")
    print(f"{'วิธีเตรียมภาพ':<18}{'psm 7':<16}{'psm 8':<16}{'psm 13':<16}")
    for name, img in variants(crop).items():
        row = [name]
        for psm in (7, 8, 13):
            txt = m._clean(pytesseract.image_to_string(img, config=f"--psm {psm} -l {args.lang}"))
            row.append(txt or "-")
        print(f"{row[0]:<18}{row[1]:<16}{row[2]:<16}{row[3]:<16}")


if __name__ == "__main__":
    main()
