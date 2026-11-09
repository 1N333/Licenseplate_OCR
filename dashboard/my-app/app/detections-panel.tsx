"use client";

import { useEffect, useState } from "react";

type Detection = {
  id: string;
  plate: string;
  direction: string;
  device: string;
  detectedAt: string;
  photoFilename: string | null;
  province: string | null;
  matched: boolean;
  ownerName: string | null;
  brand: string | null;
  model: string | null;
  color: string | null;
};

const directionLabel: Record<string, string> = {
  in: "เข้า",
  out: "ออก",
  unknown: "-",
};

export default function DetectionsPanel() {
  const [rows, setRows] = useState<Detection[]>([]);
  const [error, setError] = useState("");

  useEffect(() => {
    let active = true;
    async function load() {
      try {
        const res = await fetch("/api/detections?limit=30", { cache: "no-store" });
        const data = (await res.json()) as { detections?: Detection[]; error?: string };
        if (!active) return;
        if (!res.ok) throw new Error(data.error ?? "load failed");
        setRows(data.detections ?? []);
        setError("");
      } catch {
        if (active) setError("โหลดประวัติป้ายทะเบียนไม่สำเร็จ");
      }
    }
    void load();
    const timer = setInterval(load, 5000); // refresh every 5 s
    return () => {
      active = false;
      clearInterval(timer);
    };
  }, []);

  return (
    <section className="mx-auto my-6 w-full max-w-6xl rounded-xl bg-white p-6 shadow">
      <h2 className="mb-1 text-lg font-semibold">ป้ายทะเบียนที่ตรวจจับได้ (Raspberry Pi)</h2>
      <p className="mb-4 text-sm text-slate-500">อัปเดตอัตโนมัติทุก 5 วินาที</p>
      {error && <p className="mb-3 text-sm text-red-600">{error}</p>}
      <div className="overflow-x-auto">
        <table className="w-full text-left text-sm">
          <thead className="border-b text-slate-500">
            <tr>
              <th className="py-2 pr-3">เวลา</th>
              <th className="pr-3">ทิศทาง</th>
              <th className="pr-3">ป้ายทะเบียน</th>
              <th className="pr-3">จังหวัด</th>
              <th className="pr-3">สถานะ</th>
              <th className="pr-3">เจ้าของ / รถ</th>
              <th className="pr-3">อุปกรณ์</th>
              <th>ภาพ</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.id} className="border-b last:border-0">
                <td className="py-2 pr-3 whitespace-nowrap">
                  {new Date(r.detectedAt).toLocaleString("th-TH")}
                </td>
                <td className="pr-3">{directionLabel[r.direction] ?? r.direction}</td>
                <td className="pr-3 font-semibold">{r.plate}</td>
                <td className="pr-3">{r.province ?? "-"}</td>
                <td className="pr-3">
                  {r.matched ? (
                    <span className="rounded bg-green-100 px-2 py-0.5 text-green-700">ในทะเบียน</span>
                  ) : (
                    <span className="rounded bg-amber-100 px-2 py-0.5 text-amber-700">ไม่รู้จัก</span>
                  )}
                </td>
                <td className="pr-3">
                  {r.matched ? `${r.ownerName} · ${r.brand} ${r.model} (${r.color})` : "-"}
                </td>
                <td className="pr-3">{r.device}</td>
                <td>
                  {r.photoFilename ? (
                    <a
                      className="text-blue-600 underline"
                      href={`/api/detections/${r.id}/photo`}
                      target="_blank"
                      rel="noreferrer"
                    >
                      ดูภาพ
                    </a>
                  ) : (
                    "-"
                  )}
                </td>
              </tr>
            ))}
            {rows.length === 0 && !error && (
              <tr>
                <td colSpan={8} className="py-6 text-center text-slate-400">
                  ยังไม่มีข้อมูล
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </section>
  );
}
