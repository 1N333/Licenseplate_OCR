#!/usr/bin/env bash
# ติดตั้งให้โปรแกรมเริ่มเองทุกครั้งที่เปิดเครื่อง และเริ่มใหม่เองถ้าหยุดทำงาน
#   ./install-autostart.sh            ติดตั้ง
#   ./install-autostart.sh remove     ถอนการติดตั้ง
set -e
DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
USER_NAME="$(id -un)"
UNIT=/etc/systemd/system/plate-station.service

if [ "${1:-}" = "remove" ]; then
  sudo systemctl disable --now plate-station.service 2>/dev/null || true
  sudo rm -f "$UNIT"; sudo systemctl daemon-reload
  echo "ถอนการติดตั้งแล้ว"; exit 0
fi

chmod +x "$DIR/start.sh"
sudo tee "$UNIT" >/dev/null <<UNITEOF
[Unit]
Description=Plate Station (Raspberry Pi license plate OCR)
After=network-online.target time-sync.target
Wants=network-online.target

[Service]
Type=simple
User=$USER_NAME
WorkingDirectory=$DIR
ExecStart=$DIR/start.sh
Restart=always
RestartSec=10

[Install]
WantedBy=multi-user.target
UNITEOF

sudo usermod -aG video "$USER_NAME" 2>/dev/null || true
sudo systemctl daemon-reload
sudo systemctl enable --now plate-station.service
echo
echo "ติดตั้งเรียบร้อย โปรแกรมจะเริ่มเองทุกครั้งที่เปิดเครื่อง"
echo "ดูสถานะ:  sudo systemctl status plate-station"
echo "ดู log:   journalctl -u plate-station -f"
echo "หยุด:     sudo systemctl stop plate-station"
echo "เริ่มใหม่หลังแก้ plate-station.env:  sudo systemctl restart plate-station"
