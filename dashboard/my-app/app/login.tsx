"use client";

import { useEffect, useState, type FormEvent } from "react";
import CarManager from "./car-manager";
import CollegeBrand from "./college-brand";
import { useLanguage } from "./i18n";

type User = { email: string };
type AuthResponse = { user?: User; error?: string };

export default function Login() {
  const { t, localizeError } = useLanguage();
  const [user, setUser] = useState<User | null>(null);
  const [isCheckingSession, setIsCheckingSession] = useState(true);
  const [isRegistering, setIsRegistering] = useState(false);
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
          setUser(data.user ?? null);
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
  }, [t]);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setIsSubmitting(true);
    setErrorMessage("");

    const formData = new FormData(event.currentTarget);
    const endpoint = isRegistering ? "/api/auth/register" : "/api/auth/login";

    try {
      const response = await fetch(endpoint, {
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

      setUser(data.user ?? null);
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

  if (!isCheckingSession && user) {
    return <CarManager email={user.email} onLogout={handleLogout} />;
  }

  return (
    <main className="flex min-h-screen items-center justify-center bg-slate-100 p-6">
      <section className="w-full max-w-md rounded-2xl border border-slate-200 bg-white p-8 shadow-sm sm:p-10">
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
              {isRegistering ? t("createAccount") : t("login")}
            </h1>
            <form className="space-y-4" onSubmit={handleSubmit}>
              <label className="block">
                <span className="mb-1 block text-sm font-medium">
                  {t("email")}
                </span>
                <input
                  className="w-full rounded-md border border-slate-300 px-3 py-2"
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
                  className="w-full rounded-md border border-slate-300 px-3 py-2"
                  type="password"
                  name="password"
                  autoComplete={
                    isRegistering ? "new-password" : "current-password"
                  }
                  minLength={isRegistering ? 8 : undefined}
                  maxLength={128}
                  required
                />
                {isRegistering && (
                  <span className="mt-1 block text-xs text-slate-500">
                    {t("minPassword")}
                  </span>
                )}
              </label>
              {errorMessage && (
                <p className="text-sm text-red-700" role="alert">
                  {errorMessage}
                </p>
              )}
              <button
                className="w-full rounded-md bg-blue-700 px-4 py-2 font-medium text-white transition-colors hover:bg-blue-800 disabled:cursor-not-allowed disabled:opacity-60"
                type="submit"
                disabled={isSubmitting}
              >
                {isSubmitting
                  ? t("pleaseWait")
                  : isRegistering
                    ? t("createAccount")
                    : t("login")}
              </button>
            </form>
            <div className="mt-5 text-center">
              <button
                className="text-sm text-blue-700 underline underline-offset-2 hover:text-blue-900"
                type="button"
                onClick={() => {
                  setIsRegistering((current) => !current);
                  setErrorMessage("");
                }}
              >
                {isRegistering ? t("haveAccount") : t("needAccount")}
              </button>
            </div>
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
