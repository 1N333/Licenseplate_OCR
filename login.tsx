"use client";

import { useEffect, useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import CarManager from "./car-manager";
import CollegeBrand from "./college-brand";
import { useLanguage } from "./i18n";

type User = { email: string; role: "office" | "guard" };
type AuthResponse = { user?: User; error?: string };

export default function Login() {
  const { t, localizeError } = useLanguage();
  const router = useRouter();
  const [user, setUser] = useState<User | null>(null);
  const [isCheckingSession, setIsCheckingSession] = useState(true);
  const [isRedirecting, setIsRedirecting] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");

  useEffect(() => {
    let active = true;

    async function checkSession() {
      try {
        const response = await fetch("/api/auth/me");
        if (!active) return;

        if (response.ok) {
          const data = (await response.json()) as AuthResponse;
          if (data.user?.role === "guard") {
            setIsRedirecting(true);
            router.replace("/dashboard");
          } else {
            setUser(data.user ?? null);
          }
        } else if (response.status !== 401) {
          setErrorMessage(t("checkLoginError"));
        }
      } catch {
        if (active) {
          setErrorMessage(t("connectionError"));
        }
      } finally {
        if (active) setIsCheckingSession(false);
      }
    }

    void checkSession();
    return () => {
      active = false;
    };
  }, [router, t]);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setIsSubmitting(true);
    setErrorMessage("");

    const formData = new FormData(event.currentTarget);
    try {
      const response = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email: formData.get("email"),
          password: formData.get("password"),
        }),
      });
      const data = (await response.json()) as AuthResponse;

      if (!response.ok) {
        setErrorMessage(
          data.error
            ? localizeError(data.error)
            : t("signInError"),
        );
        return;
      }

      if (!data.user) {
        setErrorMessage(t("signInError"));
      } else if (data.user.role === "guard") {
        setIsRedirecting(true);
        router.replace("/dashboard");
      } else {
        setUser(data.user);
      }
    } catch {
      setErrorMessage(t("connectionError"));
    } finally {
      setIsSubmitting(false);
    }
  }

  async function handleLogout() {
    const response = await fetch("/api/auth/logout", { method: "POST" });
    const data = (await response.json()) as AuthResponse;
    if (!response.ok) {
      throw new Error(
        data.error ? localizeError(data.error) : t("logoutError"),
      );
    }
    setUser(null);
  }

  if (!isCheckingSession && user?.role === "office") {
    return <CarManager email={user.email} onLogout={handleLogout} />;
  }

  if (isRedirecting) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-slate-100 p-6">
        <p className="text-center text-slate-600" role="status">
          {t("redirectingToDashboard")}
        </p>
      </main>
    );
  }

  return (
    <main className="flex min-h-screen items-center justify-center bg-slate-100 p-4 sm:p-6">
      <section className="w-full max-w-md rounded-2xl border border-slate-200 bg-white p-5 shadow-sm sm:p-8 md:p-10">
        <div className="mx-auto mb-8 flex w-full max-w-sm justify-center">
          <CollegeBrand
            size="login"
            subtitle="ระบบจัดการข้อมูลรถและตรวจจับป้ายทะเบียนรถยนต์"
          />
        </div>
        {isCheckingSession ? (
          <p className="py-6 text-center text-slate-600" role="status">
            {t("loadingSession")}
          </p>
        ) : (
          <div className="mx-auto w-full max-w-sm">
            <h1 className="mb-6 text-center text-2xl font-semibold text-slate-900">
              {t("login")}
            </h1>
            <form className="space-y-4" onSubmit={handleSubmit}>
              <label className="block">
                <span className="mb-1 block text-sm font-medium">
                  {t("email")}
                </span>
                <input
                  className="min-h-11 w-full rounded-md border border-slate-300 px-3 py-2"
                  type="email"
                  name="email"
                  autoComplete="email"
                  maxLength={254}
                  required
                />
              </label>
              <label className="block">
                <span className="mb-1 block text-sm font-medium">
                  {t("password")}
                </span>
                <input
                  className="min-h-11 w-full rounded-md border border-slate-300 px-3 py-2"
                  type="password"
                  name="password"
                  autoComplete="current-password"
                  maxLength={128}
                  required
                />
              </label>
              {errorMessage && (
                <p className="text-sm text-red-700" role="alert">
                  {errorMessage}
                </p>
              )}
              <button
                className="min-h-11 w-full rounded-md bg-blue-700 px-4 py-2 font-medium text-white transition-colors hover:bg-blue-800 disabled:cursor-not-allowed disabled:opacity-60"
                type="submit"
                disabled={isSubmitting}
              >
                {isSubmitting ? t("pleaseWait") : t("login")}
              </button>
            </form>
          </div>
        )}
        {!isCheckingSession && errorMessage && user && (
          <p className="mt-4 text-sm text-red-700" role="alert">
            {errorMessage}
          </p>
        )}
      </section>
    </main>
  );
}
