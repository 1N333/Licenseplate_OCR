"use client";

import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import CollegeBrand from "../college-brand";
import DetectionsPanel from "../detections-panel";
import { useLanguage } from "../i18n";

type User = { email: string };
type Car = {
  id: string;
  plateLetters: string;
  plateNumber: string;
  province: string;
  ownerName: string;
  brand: string;
  model: string;
  photoFilename: string | null;
  createdAt: string;
};
type ApiResponse = { user?: User; cars?: Car[]; error?: string };

export default function DashboardPage() {
  const { t, localizeError } = useLanguage();
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [cars, setCars] = useState<Car[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isLoggingOut, setIsLoggingOut] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");

  useEffect(() => {
    const controller = new AbortController();

    async function loadDashboard() {
      try {
        const authResponse = await fetch("/api/auth/me", {
          signal: controller.signal,
          cache: "no-store",
        });
        const authData = (await authResponse.json()) as ApiResponse;
        if (authResponse.status === 401) {
          router.replace("/");
          return;
        }
        if (!authResponse.ok) {
          throw new Error(
            authData.error
              ? localizeError(authData.error)
              : t("checkLoginError"),
          );
        }

        const carsResponse = await fetch("/api/cars", {
          signal: controller.signal,
          cache: "no-store",
        });
        const carsData = (await carsResponse.json()) as ApiResponse;
        if (carsResponse.status === 401) {
          router.replace("/");
          return;
        }
        if (!carsResponse.ok) {
          throw new Error(
            carsData.error ? localizeError(carsData.error) : t("loadFailed"),
          );
        }

        setEmail(authData.user?.email ?? "");
        setCars(carsData.cars ?? []);
      } catch (error) {
        if (controller.signal.aborted) return;
        setErrorMessage(
          error instanceof Error ? error.message : t("loadFailed"),
        );
      } finally {
        if (!controller.signal.aborted) setIsLoading(false);
      }
    }

    void loadDashboard();
    return () => controller.abort();
  }, [localizeError, router, t]);

  const brandCount = useMemo(
    () => new Set(cars.map((car) => car.brand.trim()).filter(Boolean)).size,
    [cars],
  );
  const photoCount = useMemo(
    () => cars.filter((car) => car.photoFilename).length,
    [cars],
  );

  async function handleLogout() {
    setIsLoggingOut(true);
    setErrorMessage("");
    try {
      const response = await fetch("/api/auth/logout", { method: "POST" });
      const data = (await response.json()) as ApiResponse;
      if (!response.ok) {
        setErrorMessage(
          data.error ? localizeError(data.error) : t("logoutError"),
        );
        return;
      }
      router.replace("/");
      router.refresh();
    } catch {
      setErrorMessage(t("connectionError"));
    } finally {
      setIsLoggingOut(false);
    }
  }

  return (
    <main className="min-h-screen bg-slate-100">
      <header className="border-b border-slate-200 bg-white">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-4 px-5 py-4">
          <CollegeBrand subtitle={`${t("dashboard")} · ${email}`} />
          <nav className="flex flex-wrap items-center gap-2" aria-label="เมนูหลัก">
            <Link
              className="rounded-md border border-slate-300 px-4 py-2 text-sm font-medium hover:bg-slate-50"
              href="/"
            >
              {t("vehicleRecords")}
            </Link>
            <Link
              className="rounded-md bg-blue-700 px-4 py-2 text-sm font-medium text-white hover:bg-blue-800"
              href="/dashboard"
              aria-current="page"
            >
              {t("dashboard")}
            </Link>
            <button
              className="rounded-md border border-slate-300 px-4 py-2 text-sm font-medium hover:bg-slate-50 disabled:opacity-60"
              type="button"
              onClick={() => void handleLogout()}
              disabled={isLoggingOut}
            >
              {isLoggingOut ? t("pleaseWait") : t("logout")}
            </button>
          </nav>
        </div>
      </header>

      <section className="mx-auto max-w-6xl px-5 py-8">
        <div className="mb-8 rounded-2xl bg-gradient-to-r from-blue-950 to-blue-700 px-6 py-8 text-white sm:px-8">
          <p className="text-sm font-medium text-blue-100">{t("dashboard")}</p>
          <h1 className="mt-2 text-2xl font-bold sm:text-3xl">
            {t("dashboardWelcome")}
          </h1>
          <p className="mt-2 text-sm text-blue-100">
            {t("dashboardDescription")}
          </p>
        </div>

        {errorMessage && (
          <p
            className="mb-6 rounded-md bg-red-50 p-3 text-sm text-red-800"
            role="alert"
          >
            {errorMessage}
          </p>
        )}

        {isLoading ? (
          <p className="py-12 text-center text-slate-600" role="status">
            {t("loadingCars")}
          </p>
        ) : (
          <>
            <div className="mb-8 grid gap-4 sm:grid-cols-3">
              {[
                {
                  label: t("allVehicles"),
                  value: cars.length,
                  accent: "bg-blue-100 text-blue-800",
                  icon: "01",
                },
                {
                  label: t("vehicleBrands"),
                  value: brandCount,
                  accent: "bg-violet-100 text-violet-800",
                  icon: "02",
                },
                {
                  label: t("vehiclesWithPhotos"),
                  value: photoCount,
                  accent: "bg-emerald-100 text-emerald-800",
                  icon: "03",
                },
              ].map((stat) => (
                <article
                  className="flex items-center justify-between rounded-xl border border-slate-200 bg-white p-5 shadow-sm"
                  key={stat.label}
                >
                  <div>
                    <p className="text-sm text-slate-500">{stat.label}</p>
                    <p className="mt-2 text-3xl font-bold text-slate-900">
                      {isLoading ? "—" : stat.value.toLocaleString("th-TH")}
                    </p>
                  </div>
                  <span
                    className={`flex size-11 items-center justify-center rounded-full text-sm font-bold ${stat.accent}`}
                    aria-hidden="true"
                  >
                    {stat.icon}
                  </span>
                </article>
              ))}
            </div>

            <section className="mb-8 overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
              <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 px-5 py-4">
                <h2 className="text-lg font-semibold text-slate-900">
                  {t("recentVehicles")}
                </h2>
                <Link
                  className="text-sm font-medium text-blue-700 hover:underline"
                  href="/"
                >
                  {t("viewAllVehicles")}
                </Link>
              </div>

              {cars.length === 0 ? (
                <div className="px-5 py-12 text-center">
                  <p className="font-medium text-slate-800">
                    {t("dashboardEmptyTitle")}
                  </p>
                  <p className="mt-1 text-sm text-slate-500">
                    {t("dashboardEmptyDescription")}
                  </p>
                  <Link
                    className="mt-5 inline-flex rounded-md bg-blue-700 px-4 py-2 text-sm font-medium text-white hover:bg-blue-800"
                    href="/"
                  >
                    {t("browseVehicles")}
                  </Link>
                </div>
              ) : (
                <ul className="divide-y divide-slate-100">
                  {cars.slice(0, 5).map((car) => (
                    <li
                      className="flex flex-wrap items-center gap-4 px-5 py-4"
                      key={car.id}
                    >
                      <div className="relative flex size-12 shrink-0 items-center justify-center overflow-hidden rounded-lg bg-slate-100 text-xs text-slate-400">
                        {car.photoFilename ? (
                          <Image
                            className="object-cover"
                            src={`/api/cars/${car.id}/photo`}
                            alt=""
                            fill
                            sizes="48px"
                            unoptimized
                          />
                        ) : (
                          <span aria-hidden="true">รถ</span>
                        )}
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className="font-semibold text-slate-900">
                          {car.plateLetters} {car.plateNumber}
                          <span className="ml-2 text-sm font-normal text-slate-500">
                            {car.province}
                          </span>
                        </p>
                        <p className="mt-1 truncate text-sm text-slate-600">
                          {car.brand} {car.model} · {car.ownerName}
                        </p>
                      </div>
                      <time
                        className="text-sm text-slate-500"
                        dateTime={car.createdAt}
                      >
                        {new Date(car.createdAt).toLocaleDateString("th-TH", {
                          day: "numeric",
                          month: "short",
                          year: "numeric",
                        })}
                      </time>
                    </li>
                  ))}
                </ul>
              )}
            </section>
          </>
        )}
        {!isLoading && <DetectionsPanel />}
      </section>
    </main>
  );
}
