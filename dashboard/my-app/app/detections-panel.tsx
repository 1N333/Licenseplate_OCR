"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useLanguage } from "./i18n";

type Detection = {
  id: string;
  plate: string;
  direction: "in" | "out" | "unknown";
  device: string;
  detectedAt: string;
  photoFilename: string | null;
  province: string | null;
  carProvince: string | null;
  matched: boolean;
  ownerName: string | null;
  brand: string | null;
  model: string | null;
  color: string | null;
};

type DirectionFilter = "all" | "in" | "out";

export default function DetectionsPanel() {
  const { t } = useLanguage();
  const [rows, setRows] = useState<Detection[]>([]);
  const [error, setError] = useState("");
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [filter, setFilter] = useState<DirectionFilter>("all");
  const isRequestInProgress = useRef(false);

  const loadDetections = useCallback(async (signal?: AbortSignal) => {
    if (signal?.aborted || isRequestInProgress.current) return;
    isRequestInProgress.current = true;
    setIsRefreshing(true);

    try {
      const response = await fetch("/api/detections?limit=30", {
        signal,
        cache: "no-store",
      });
      const data = (await response.json()) as {
        detections?: Detection[];
        error?: string;
      };
      if (!response.ok) throw new Error(data.error ?? "Could not load detections.");

      setRows(data.detections ?? []);
      setError("");
    } catch (loadError) {
      if (loadError instanceof DOMException && loadError.name === "AbortError") {
        return;
      }
      setError(t("detectionLoadFailed"));
    } finally {
      isRequestInProgress.current = false;
      if (!signal?.aborted) {
        setIsLoading(false);
        setIsRefreshing(false);
      }
    }
  }, [t]);

  useEffect(() => {
    const controller = new AbortController();
    const initialLoad = setTimeout(() => {
      void loadDetections(controller.signal);
    }, 0);
    const timer = setInterval(() => {
      void loadDetections(controller.signal);
    }, 5000);

    return () => {
      controller.abort();
      clearTimeout(initialLoad);
      clearInterval(timer);
    };
  }, [loadDetections]);

  const visibleRows = useMemo(
    () => rows.filter((row) => filter === "all" || row.direction === filter),
    [filter, rows],
  );
  const incomingCount = rows.filter((row) => row.direction === "in").length;
  const outgoingCount = rows.filter((row) => row.direction === "out").length;

  return (
    <section className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
      <div className="flex flex-wrap items-start justify-between gap-4 border-b border-slate-200 px-5 py-4">
        <div>
          <h2 className="text-lg font-semibold text-slate-900">
            {t("detectionsTitle")}
          </h2>
          <p className="mt-1 text-sm text-slate-500">
            {t("detectionsDescription")} · {rows.length} {t("detectionsCount")}
          </p>
        </div>
        <button
          className="rounded-md border border-slate-300 px-3 py-2 text-sm font-medium hover:bg-slate-50 disabled:opacity-60"
          type="button"
          onClick={() => void loadDetections()}
          disabled={isRefreshing}
        >
          {isRefreshing ? t("pleaseWait") : t("refresh")}
        </button>
      </div>

      <div className="grid gap-3 border-b border-slate-100 p-5 sm:grid-cols-2">
        {([
          ["in", t("incoming"), incomingCount, "bg-emerald-50 text-emerald-800"],
          ["out", t("outgoing"), outgoingCount, "bg-amber-50 text-amber-800"],
        ] as const).map(([direction, label, count, accent]) => (
          <article
            className="flex items-center justify-between rounded-lg border border-slate-200 px-4 py-3"
            key={direction}
          >
            <span className="font-medium text-slate-700">{label}</span>
            <span className={`rounded-full px-3 py-1 text-sm font-bold ${accent}`}>
              {count.toLocaleString("th-TH")}
            </span>
          </article>
        ))}
      </div>

      <div className="flex flex-wrap gap-2 px-5 pt-4">
        {(
          [
            ["all", t("allDirections"), "bg-blue-700"],
            ["in", t("entered"), "bg-emerald-700"],
            ["out", t("exited"), "bg-amber-600"],
          ] as const
        ).map(([direction, label, activeColor]) => (
          <button
            className={`rounded-full px-3 py-1.5 text-sm font-medium ${
              filter === direction
                ? `${activeColor} text-white`
                : "bg-slate-100 text-slate-700 hover:bg-slate-200"
            }`}
            key={direction}
            type="button"
            aria-pressed={filter === direction}
            onClick={() => setFilter(direction)}
          >
            {label}
          </button>
        ))}
      </div>

      {error && (
        <p
          className="mx-5 mt-4 rounded-md bg-red-50 p-3 text-sm text-red-800"
          role="alert"
        >
          {error}
        </p>
      )}

      <div className="overflow-x-auto p-5">
        <table className="w-full min-w-[850px] text-left text-sm">
          <thead className="border-b border-slate-200 text-slate-500">
            <tr>
              <th className="py-3 pr-4 font-medium">{t("detectedAt")}</th>
              <th className="pr-4 font-medium">{t("direction")}</th>
              <th className="pr-4 font-medium">{t("detectedPlate")}</th>
              <th className="pr-4 font-medium">{t("detectedProvince")}</th>
              <th className="pr-4 font-medium">{t("detectionStatus")}</th>
              <th className="pr-4 font-medium">{t("detectedOwner")}</th>
              <th className="pr-4 font-medium">{t("detectionDevice")}</th>
              <th className="font-medium">{t("detectionPhoto")}</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {visibleRows.map((row) => (
              <tr key={row.id}>
                <td className="whitespace-nowrap py-3 pr-4 text-slate-600">
                  {new Date(row.detectedAt).toLocaleString("th-TH")}
                </td>
                <td className="pr-4">
                  <span
                    className={`rounded-full px-2.5 py-1 text-xs font-semibold ${
                      row.direction === "in"
                        ? "bg-emerald-100 text-emerald-800"
                        : row.direction === "out"
                          ? "bg-amber-100 text-amber-800"
                          : "bg-slate-100 text-slate-600"
                    }`}
                  >
                    {row.direction === "in"
                      ? t("entered")
                      : row.direction === "out"
                        ? t("exited")
                        : t("unknownDirection")}
                  </span>
                </td>
                <td className="pr-4 font-semibold text-slate-900">{row.plate}</td>
                <td className="pr-4 text-slate-600">
                  {row.province || row.carProvince || "—"}
                </td>
                <td className="pr-4">
                  <span
                    className={`rounded-full px-2.5 py-1 text-xs font-medium ${
                      row.matched
                        ? "bg-green-100 text-green-700"
                        : "bg-amber-100 text-amber-700"
                    }`}
                  >
                    {row.matched ? t("registeredStatus") : t("unrecognizedStatus")}
                  </span>
                </td>
                <td className="pr-4 text-slate-600">
                  {row.matched
                    ? `${row.ownerName} · ${row.brand} ${row.model} (${row.color})`
                    : "—"}
                </td>
                <td className="pr-4 text-slate-600">{row.device}</td>
                <td>
                  {row.photoFilename ? (
                    <a
                      className="font-medium text-blue-700 hover:underline"
                      href={`/api/detections/${row.id}/photo`}
                      target="_blank"
                      rel="noreferrer"
                    >
                      {t("viewDetectionPhoto")}
                    </a>
                  ) : (
                    "—"
                  )}
                </td>
              </tr>
            ))}
            {visibleRows.length === 0 && (
              <tr>
                <td colSpan={8} className="py-10 text-center text-slate-500">
                  {isLoading ? t("loadingCars") : t("noDetections")}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </section>
  );
}
