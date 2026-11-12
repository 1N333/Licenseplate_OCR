#!/usr/bin/env bash
# จัดไฟล์ Dashboard ที่อัปโหลดกองรวมกันให้เข้าโฟลเดอร์ถูกต้อง
# วิธีใช้: เปิดเทอร์มินัลในโฟลเดอร์ repo (ที่มีโฟลเดอร์ dashboard) แล้วรัน  bash organize-dashboard.sh
set -e
cd "$(dirname "$0")/dashboard/my-app" 2>/dev/null || cd dashboard/my-app
mv_to() { # ไฟล์ต้นทาง  ปลายทาง
  [ -f "$1" ] || { echo "ข้าม (ไม่พบ): $1"; return; }
  mkdir -p "$(dirname "$2")"
  if git rev-parse --git-dir >/dev/null 2>&1; then git mv -f "$1" "$2" 2>/dev/null || mv -f "$1" "$2"; else mv -f "$1" "$2"; fi
  echo "ย้าย  $1 -> $2"
}
mv_to "auth.ts" "lib/auth.ts"
mv_to "cars.ts" "lib/cars.ts"
mv_to "db.ts" "lib/db.ts"
mv_to "detections.ts" "lib/detections.ts"
mv_to "plate-match.ts" "lib/plate-match.ts"
mv_to "car-catalog.ts" "app/car-catalog.ts"
mv_to "car-colors.ts" "app/car-colors.ts"
mv_to "car-provinces.ts" "app/car-provinces.ts"
mv_to "car-manager.tsx" "app/car-manager.tsx"
mv_to "college-brand.tsx" "app/college-brand.tsx"
mv_to "detections-panel.tsx" "app/detections-panel.tsx"
mv_to "i18n.tsx" "app/i18n.tsx"
mv_to "login.tsx" "app/login.tsx"
mv_to "Index.tsx" "app/Index.tsx"
mv_to "layout.tsx" "app/layout.tsx"
mv_to "page.tsx" "app/page.tsx"
mv_to "globals.css" "app/globals.css"
mv_to "page (10).tsx" "app/dashboard/page.tsx"
mv_to "route.ts" "app/api/auth/logout/route.ts"
mv_to "route (1).ts" "app/api/auth/me/route.ts"
mv_to "route (2).ts" "app/api/auth/register/route.ts"
mv_to "route (3).ts" "app/api/auth/login/route.ts"
mv_to "route (4).ts" "app/api/cars/route.ts"
mv_to "route (5).ts" "app/api/cars/[id]/route.ts"
mv_to "route (6).ts" "app/api/cars/[id]/photo/route.ts"
mv_to "route (7).ts" "app/api/detections/route.ts"
mv_to "route (8).ts" "app/api/detections/[id]/photo/route.ts"
mv_to "route (9).ts" "app/api/db/health/route.ts"
echo
echo "เสร็จแล้ว ตรวจด้วย git status แล้ว git add -A && git commit -m 'Organize dashboard files' && git push"
