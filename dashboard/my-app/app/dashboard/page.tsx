"use client";

import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import CollegeBrand from "../college-brand";
import DetectionsPanel from "../detections-panel";
import { useLanguage } from "../i18n";

type User = { email: string; role: "office" | "guard" };
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
  const [role, setRole] = useState<User["role"] | null>(null);
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

        const user = authData.user;
        if (!user) throw new Error(t("checkLoginError"));
        setEmail(user.email);
        setRole(user.role);

        if (user.role === "office") {
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
          setCars(carsData.cars ?? []);
        }
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
        <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-4 px-4 py-4 sm:px-5">
          <CollegeBrand subtitle={`${t("dashboard")} · ${email}`} />
          <nav className="flex w-full flex-wrap gap-2 sm:w-auto" aria-label="เมนูหลัก">
            {role === "office" && (
              <Link
                className="min-h-11 min-w-0 flex-1 rounded-md border border-slate-300 px-2 py-2 text-center text-sm font-medium hover:bg-slate-50 sm:flex-none sm:px-4"
                href="/"
              >
                {t("vehicleRecords")}
              </Link>
            )}
            <Link
              className="min-h-11 min-w-0 flex-1 rounded-md bg-blue-700 px-2 py-2 text-center text-sm font-medium text-white hover:bg-blue-800 sm:flex-none sm:px-4"
              href="/dashboard"
              aria-current="page"
            >
              {t("dashboard")}
            </Link>
            <button
              className="min-h-11 min-w-0 flex-1 rounded-md border border-slate-300 px-2 py-2 text-center text-sm font-medium hover:bg-slate-50 disabled:opacity-60 sm:flex-none sm:px-4"
              type="button"
              onClick={() => void handleLogout()}
              disabled={isLoggingOut}
            >
              {isLoggingOut ? t("pleaseWait") : t("logout")}
            </button>
          </nav>
        </div>
      </header>

      <section className="mx-auto max-w-6xl px-4 py-6 sm:px-5 sm:py-8">
        <div className="mb-8 rounded-2xl bg-gradient-to-r from-blue-950 to-blue-700 px-4 py-6 text-white sm:px-8 sm:py-8">
          <p className="text-sm font-medium text-blue-100">{t("dashboard")}</p>
          <h1 className="mt-2 text-2xl font-bold sm:text-3xl">
            {t("dashboardWelcome")}
          </h1>
          <p className="mt-2 text-sm text-blue-100">
            {role === "office"
              ? t("officeDashboardDescription")
              : t("dashboardDescription")}
            {role && (
              <span className="mt-2 block font-medium">
                {role === "office" ? t("officeRole") : t("guardRole")}
              </span>
            )}
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
            {t("loadingDashboard")}
          </p>
        ) : (
          <>
            {role === "office" && (
              <div className="mb-8 grid grid-cols-3 gap-2 sm:gap-4">
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
                    className="flex min-w-0 items-center justify-between rounded-xl border border-slate-200 bg-white p-3 shadow-sm sm:p-5"
                    key={stat.label}
                  >
                    <div className="min-w-0">
                      <p className="break-words text-xs leading-tight text-slate-500 sm:text-sm">
                        {stat.label}
                      </p>
                      <p className="mt-1 text-2xl font-bold text-slate-900 sm:mt-2 sm:text-3xl">
                        {stat.value.toLocaleString("th-TH")}
                      </p>
                    </div>
                    <span
                      className={`hidden size-11 shrink-0 items-center justify-center rounded-full text-sm font-bold sm:flex ${stat.accent}`}
                      aria-hidden="true"
                    >
                      {stat.icon}
                    </span>
                  </article>
                ))}
              </div>
            )}

            {role === "office" && (
              <section className="mb-8 overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
                <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 px-5 py-4">
                  <h2 className="text-lg font-semibold text-slate-900">
                    {t("recentVehicles")}
                  </h2>
                  <Link
                    className="inline-flex min-h-11 items-center rounded-md px-3 text-sm font-medium text-blue-700 hover:bg-blue-50 hover:underline"
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
                      className="mt-5 inline-flex min-h-11 items-center rounded-md bg-blue-700 px-4 py-2 text-sm font-medium text-white hover:bg-blue-800"
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
                          <p className="mt-1 break-words text-sm text-slate-600">
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
            )}
          </>
        )}
        {!isLoading && <DetectionsPanel />}
      </section>
    </main>
  );
}
