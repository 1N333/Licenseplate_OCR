"use client";

import Image from "next/image";
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
  registeredPlate: string | null;
  ownerName: string | null;
  brand: string | null;
  model: string | null;
  color: string | null;
};

function shownPlate(d: Detection): string {
  return d.matched && d.registeredPlate ? d.registeredPlate : d.plate;
}

function ocrNote(d: Detection): string | null {
  return d.matched &&
    d.registeredPlate &&
    d.registeredPlate.replace(/\s+/g, "") !== d.plate
    ? d.plate
    : null;
}

function shownProvince(d: Detection): string {
  return (d.matched ? d.carProvince : null) || d.province || d.carProvince || "—";
}

type DirectionFilter = "all" | "in" | "out";
type DetectionResponse = {
  detections: Detection[];
  latestDetection: Detection | null;
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
  error?: string;
};

const pageSize = 10;

export default function DetectionsPanel() {
  const { t } = useLanguage();
  const [rows, setRows] = useState<Detection[]>([]);
  const [latestDetection, setLatestDetection] = useState<Detection | null>(null);
  const [error, setError] = useState("");
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [filter, setFilter] = useState<DirectionFilter>("all");
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const [totalPages, setTotalPages] = useState(1);
  const requestId = useRef(0);

  const loadDetections = useCallback(
    async (requestedPage: number, signal?: AbortSignal) => {
      if (signal?.aborted) return;
      const currentRequestId = ++requestId.current;
      setIsRefreshing(true);

      try {
        const response = await fetch(
          `/api/detections?limit=${pageSize}&page=${requestedPage}`,
          { signal, cache: "no-store" },
        );
        const data = (await response.json()) as DetectionResponse;
        if (!response.ok) {
          throw new Error(data.error ?? "Could not load detections.");
        }
        if (signal?.aborted || currentRequestId !== requestId.current) return;

        setRows(data.detections);
        setLatestDetection(data.latestDetection);
        setPage(data.page);
        setTotal(data.total);
        setTotalPages(data.totalPages);
        setError("");
      } catch (loadError) {
        if (
          (loadError instanceof DOMException && loadError.name === "AbortError") ||
          signal?.aborted ||
          currentRequestId !== requestId.current
        ) {
          return;
        }
        setError(t("detectionLoadFailed"));
      } finally {
        if (currentRequestId === requestId.current) {
          setIsLoading(false);
          setIsRefreshing(false);
        }
      }
    },
    [t],
  );

  useEffect(() => {
    const controller = new AbortController();
    const initialLoad = window.setTimeout(
      () => void loadDetections(page, controller.signal),
      0,
    );
    const timer =
      page === 1
        ? window.setInterval(
            () => void loadDetections(1, controller.signal),
            5000,
          )
        : undefined;

    return () => {
      controller.abort();
      requestId.current += 1;
      window.clearTimeout(initialLoad);
      if (timer !== undefined) window.clearInterval(timer);
    };
  }, [loadDetections, page]);

  const visibleRows = useMemo(
    () => rows.filter((row) => filter === "all" || row.direction === filter),
    [filter, rows],
  );
  const incomingCount = rows.filter((row) => row.direction === "in").length;
  const outgoingCount = rows.filter((row) => row.direction === "out").length;

  function directionLabel(direction: Detection["direction"]) {
    if (direction === "in") return t("entered");
    if (direction === "out") return t("exited");
    return t("unknownDirection");
  }

  function directionClass(direction: Detection["direction"]) {
    if (direction === "in") return "bg-emerald-100 text-emerald-800";
    if (direction === "out") return "bg-amber-100 text-amber-800";
    return "bg-slate-100 text-slate-600";
  }

  function emptyMessage() {
    return (
      <p className="py-8 text-center text-sm text-slate-500">
        {isLoading ? t("loadingDetections") : t("noDetections")}
      </p>
    );
  }

  return (
    <section className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
      <div className="flex flex-col gap-3 border-b border-slate-200 px-4 py-4 sm:flex-row sm:items-start sm:justify-between sm:px-5">
        <div>
          <h2 className="text-lg font-semibold text-slate-900">
            {t("detectionsTitle")}
          </h2>
          <p className="mt-1 text-sm text-slate-500">
            {t("detectionsDescription")} · {total.toLocaleString("th-TH")}{" "}
            {t("detectionsCount")}
          </p>
        </div>
        <button
          className="min-h-11 w-full rounded-md border border-slate-300 px-3 py-2 text-sm font-medium hover:bg-slate-50 disabled:opacity-60 sm:w-auto"
          type="button"
          onClick={() => void loadDetections(page)}
          disabled={isRefreshing}
        >
          {isRefreshing ? t("pleaseWait") : t("refresh")}
        </button>
      </div>

      <div className="border-b border-slate-100 p-4 sm:px-5">
        <div className="grid gap-4 rounded-lg border border-slate-200 p-4 sm:grid-cols-[10rem_minmax(0,1fr)] sm:items-center">
          <div className="relative aspect-video overflow-hidden rounded-md bg-slate-100">
            {latestDetection?.photoFilename ? (
              <Image
                className="object-cover"
                src={`/api/detections/${latestDetection.id}/photo`}
                alt={t("latestCameraPhoto")}
                fill
                sizes="160px"
                unoptimized
              />
            ) : (
              <div className="flex h-full flex-col items-center justify-center gap-2 px-2 text-center text-xs text-slate-500">
                <svg
                  className="size-8 text-slate-400"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="1.5"
                  aria-hidden="true"
                >
                  <path d="M4 7h3l1.5-2h7L17 7h3a1 1 0 0 1 1 1v10a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V8a1 1 0 0 1 1-1Z" />
                  <circle cx="12" cy="13" r="3.5" />
                </svg>
                <span>
                  {latestDetection
                    ? t("cameraNoPhoto")
                    : isLoading
                      ? t("loadingDetections")
                      : t("cameraNoDetections")}
                </span>
              </div>
            )}
          </div>
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <h3 className="font-semibold text-slate-900">
                {t("cameraTitle")}
              </h3>
              <span className="rounded-full bg-blue-100 px-2.5 py-1 text-xs font-semibold text-blue-800">
                {t("oneCamera")}
              </span>
            </div>
            <p className="mt-2 text-sm text-slate-500">
              {t("latestCameraDetection")}
            </p>
            {latestDetection ? (
              <>
                <p className="mt-1 font-semibold text-slate-900">
                  {shownPlate(latestDetection)} · {directionLabel(latestDetection.direction)}
                </p>
                <p className="mt-1 text-sm text-slate-600">
                  {new Date(latestDetection.detectedAt).toLocaleString("th-TH")}
                  {" · "}
                  {shownProvince(latestDetection)}
                </p>
                {latestDetection.photoFilename && (
                  <a
                    className="mt-2 inline-flex font-medium text-blue-700 underline"
                    href={`/api/detections/${latestDetection.id}/photo`}
                    target="_blank"
                    rel="noreferrer"
                  >
                    {t("viewDetectionPhoto")}
                  </a>
                )}
              </>
            ) : (
              <p className="mt-1 text-sm text-slate-600">
                {isLoading ? t("loadingDetections") : t("cameraNoDetections")}
              </p>
            )}
          </div>
        </div>
      </div>

      <div className="grid gap-3 border-b border-slate-100 p-4 sm:grid-cols-2 sm:p-5">
        {(
          [
            ["in", t("incomingOnPage"), incomingCount, "bg-emerald-50 text-emerald-800"],
            ["out", t("outgoingOnPage"), outgoingCount, "bg-amber-50 text-amber-800"],
          ] as const
        ).map(([, label, count, accent]) => (
          <article
            className="flex items-center justify-between rounded-lg border border-slate-200 px-4 py-3"
            key={label}
          >
            <span className="font-medium text-slate-700">{label}</span>
            <span className={`rounded-full px-3 py-1 text-sm font-bold ${accent}`}>
              {count.toLocaleString("th-TH")}
            </span>
          </article>
        ))}
      </div>

      <div className="flex flex-wrap gap-2 px-4 pt-4 sm:px-5">
        {(
          [
            ["all", t("allDirections"), "bg-blue-700"],
            ["in", t("entered"), "bg-emerald-700"],
            ["out", t("exited"), "bg-amber-600"],
          ] as const
        ).map(([direction, label, activeColor]) => (
          <button
            className={`min-h-11 rounded-full px-4 py-2 text-sm font-medium ${
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
          className="mx-4 mt-4 rounded-md bg-red-50 p-3 text-sm text-red-800 sm:mx-5"
          role="alert"
        >
          {error}
        </p>
      )}

      <ul className="space-y-3 p-4 md:hidden">
        {visibleRows.map((row) => (
          <li
            className="rounded-lg border border-slate-200 p-4"
            key={row.id}
          >
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="font-semibold text-slate-900">{shownPlate(row)}</p>
                {ocrNote(row) && (
                  <p className="text-xs text-slate-500">
                    {t("ocrReadAs")} {ocrNote(row)}
                  </p>
                )}
                <p className="mt-1 text-sm text-slate-500">
                  {new Date(row.detectedAt).toLocaleString("th-TH")}
                </p>
              </div>
              <span
                className={`shrink-0 rounded-full px-2.5 py-1 text-xs font-semibold ${directionClass(row.direction)}`}
              >
                {directionLabel(row.direction)}
              </span>
            </div>
            <dl className="mt-4 grid grid-cols-2 gap-x-3 gap-y-3 text-sm">
              <div>
                <dt className="text-xs text-slate-500">{t("detectedProvince")}</dt>
                <dd className="mt-1 text-slate-800">
                  {shownProvince(row)}
                </dd>
              </div>
              <div>
                <dt className="text-xs text-slate-500">{t("detectionStatus")}</dt>
                <dd className="mt-1 text-slate-800">
                  {row.matched ? t("registeredStatus") : t("unrecognizedStatus")}
                </dd>
              </div>
              <div className="col-span-2">
                <dt className="text-xs text-slate-500">{t("detectedOwner")}</dt>
                <dd className="mt-1 break-words text-slate-800">
                  {row.matched
                    ? `${row.ownerName} · ${row.brand} ${row.model} (${row.color})`
                    : "—"}
                </dd>
              </div>
              <div>
                <dt className="text-xs text-slate-500">{t("detectionDevice")}</dt>
                <dd className="mt-1 break-words text-slate-800">{row.device}</dd>
              </div>
              <div>
                <dt className="text-xs text-slate-500">{t("detectionPhoto")}</dt>
                <dd className="mt-1">
                  {row.photoFilename ? (
                    <a
                      className="font-medium text-blue-700 underline"
                      href={`/api/detections/${row.id}/photo`}
                      target="_blank"
                      rel="noreferrer"
                    >
                      {t("viewDetectionPhoto")}
                    </a>
                  ) : (
                    "—"
                  )}
                </dd>
              </div>
            </dl>
          </li>
        ))}
        {visibleRows.length === 0 && <li>{emptyMessage()}</li>}
      </ul>

      <div className="hidden overflow-x-auto p-5 md:block">
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
                    className={`rounded-full px-2.5 py-1 text-xs font-semibold ${directionClass(row.direction)}`}
                  >
                    {directionLabel(row.direction)}
                  </span>
                </td>
                <td className="pr-4 font-semibold text-slate-900">
                  {shownPlate(row)}
                  {ocrNote(row) && (
                    <span className="block text-xs font-normal text-slate-500">
                      {t("ocrReadAs")} {ocrNote(row)}
                    </span>
                  )}
                </td>
                <td className="pr-4 text-slate-600">
                  {shownProvince(row)}
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
                <td colSpan={8}>{emptyMessage()}</td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      <div className="flex flex-col gap-3 border-t border-slate-100 px-4 py-4 sm:flex-row sm:items-center sm:justify-between sm:px-5">
        <p className="text-center text-sm text-slate-600" aria-live="polite">
          {t("detectionsPageStatus", {
            page: page.toLocaleString("th-TH"),
            pages: totalPages.toLocaleString("th-TH"),
            total: total.toLocaleString("th-TH"),
          })}
        </p>
        <div className="grid grid-cols-2 gap-2">
          <button
            className="min-h-11 rounded-md border border-slate-300 px-4 py-2 text-sm font-medium hover:bg-slate-50 disabled:opacity-50"
            type="button"
            onClick={() => setPage((current) => Math.max(1, current - 1))}
            disabled={page <= 1 || isRefreshing}
          >
            {t("newerDetections")}
          </button>
          <button
            className="min-h-11 rounded-md border border-slate-300 px-4 py-2 text-sm font-medium hover:bg-slate-50 disabled:opacity-50"
            type="button"
            onClick={() =>
              setPage((current) => Math.min(totalPages, current + 1))
            }
            disabled={page >= totalPages || isRefreshing}
          >
            {t("olderDetections")}
          </button>
        </div>
      </div>
    </section>
  );
}
