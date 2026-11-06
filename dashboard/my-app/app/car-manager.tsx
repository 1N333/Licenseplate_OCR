"use client";

import Image from "next/image";
import { useEffect, useMemo, useState, type FormEvent } from "react";
import { carColors, colorGroups } from "./car-colors";
import { carBrands, getModelsForBrand } from "./car-catalog";
import { provinceGroups, thaiProvinces } from "./car-provinces";
import { useLanguage } from "./i18n";

type Car = {
  id: string;
  plateLetters: string;
  plateNumber: string;
  province: string;
  ownerName: string;
  ownerPhone: string;
  brand: string;
  model: string;
  color: string;
  photoFilename: string | null;
  createdAt: string;
};

type CarForm = Omit<Car, "id" | "photoFilename" | "createdAt">;

const emptyCar: CarForm = {
  plateLetters: "",
  plateNumber: "",
  province: "",
  ownerName: "",
  ownerPhone: "",
  brand: "",
  model: "",
  color: "",
};

type ApiResponse = { error?: string; cars?: Car[] };

export default function CarManager({
  email,
  onLogout,
}: {
  email: string;
  onLogout: () => Promise<void>;
}) {
  const { t, localizeError } = useLanguage();
  const [cars, setCars] = useState<Car[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [editingCar, setEditingCar] = useState<Car | null>(null);
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [selectedBrand, setSelectedBrand] = useState("");
  const [selectedColor, setSelectedColor] = useState("");
  const [search, setSearch] = useState("");
  const [errorMessage, setErrorMessage] = useState("");
  const [photoFile, setPhotoFile] = useState<File | null>(null);
  const [photoPreview, setPhotoPreview] = useState<string | null>(null);
  const [removePhoto, setRemovePhoto] = useState(false);

  async function loadCars(signal?: AbortSignal) {
    try {
      const response = await fetch("/api/cars", {
        signal,
        cache: "no-store",
      });
      const data = (await response.json()) as ApiResponse;
      if (!response.ok) {
        throw new Error(
          data.error
            ? localizeError(data.error)
            : t("loadFailed"),
        );
      }
      setCars(data.cars ?? []);
      setErrorMessage("");
    } catch (error) {
      if (error instanceof DOMException && error.name === "AbortError") return;
      setErrorMessage(
        error instanceof Error ? error.message : t("loadFailed"),
      );
    } finally {
      if (!signal?.aborted) setIsLoading(false);
    }
  }

  useEffect(() => {
    const controller = new AbortController();
    void fetch("/api/cars", {
      signal: controller.signal,
      cache: "no-store",
    })
      .then(async (response) => ({
        response,
        data: (await response.json()) as ApiResponse,
      }))
      .then(({ response, data }) => {
        if (!response.ok) {
          throw new Error(
            data.error ? localizeError(data.error) : t("loadFailed"),
          );
        }
        setCars(data.cars ?? []);
        setErrorMessage("");
      })
      .catch((error: unknown) => {
        if (controller.signal.aborted) return;
        setErrorMessage(
          error instanceof Error ? error.message : t("loadFailed"),
        );
      })
      .finally(() => {
        if (!controller.signal.aborted) setIsLoading(false);
      });
    return () => controller.abort();
  }, [localizeError, t]);

  const visibleCars = useMemo(() => {
    const query = search.trim().toLocaleLowerCase();
    if (!query) return cars;
    return cars.filter((car) =>
      [
        car.plateLetters,
        car.plateNumber,
        car.province,
        car.ownerName,
        car.ownerPhone,
        car.brand,
        car.model,
        car.color,
      ]
        .join(" ")
        .toLocaleLowerCase()
        .includes(query),
    );
  }, [cars, search]);

  useEffect(() => {
    return () => {
      if (photoPreview) URL.revokeObjectURL(photoPreview);
    };
  }, [photoPreview]);

  function clearPhotoPreview() {
    setPhotoPreview(null);
  }

  function openCreateForm() {
    setEditingCar(null);
    setSelectedBrand("");
    setSelectedColor("");
    setPhotoFile(null);
    clearPhotoPreview();
    setRemovePhoto(false);
    setErrorMessage("");
    setIsFormOpen(true);
  }

  function openEditForm(car: Car) {
    setEditingCar(car);
    setSelectedBrand(car.brand);
    setSelectedColor(
      carColors.some((color) => color === car.color)
        ? car.color
        : "__custom__",
    );
    setPhotoFile(null);
    clearPhotoPreview();
    setRemovePhoto(false);
    setErrorMessage("");
    setIsFormOpen(true);
  }

  async function handleSave(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setIsSaving(true);
    setErrorMessage("");
    const formData = new FormData(event.currentTarget);
    formData.set("removePhoto", removePhoto ? "true" : "false");

    try {
      const response = await fetch(
        editingCar ? `/api/cars/${editingCar.id}` : "/api/cars",
        {
          method: editingCar ? "PATCH" : "POST",
          body: formData,
        },
      );
      const data = (await response.json()) as ApiResponse;
      if (!response.ok) {
        setErrorMessage(
          data.error ? localizeError(data.error) : t("saveFailed"),
        );
        return;
      }

      setIsFormOpen(false);
      setEditingCar(null);
      setPhotoFile(null);
      clearPhotoPreview();
      await loadCars();
    } catch {
      setErrorMessage(t("connectionError"));
    } finally {
      setIsSaving(false);
    }
  }

  async function handleDelete(car: Car) {
    if (
      !window.confirm(
        t("confirmDelete", {
          plate: `${car.plateLetters} ${car.plateNumber}`,
          province: car.province,
        }),
      )
    ) {
      return;
    }

    setErrorMessage("");
    try {
      const response = await fetch(`/api/cars/${car.id}`, { method: "DELETE" });
      const data = (await response.json()) as ApiResponse;
      if (!response.ok) {
        setErrorMessage(
          data.error ? localizeError(data.error) : t("deleteFailed"),
        );
        return;
      }
      setCars((current) => current.filter((item) => item.id !== car.id));
    } catch {
      setErrorMessage(t("connectionError"));
    }
  }

  async function handleLogout() {
    setErrorMessage("");
    try {
      await onLogout();
    } catch (error) {
      setErrorMessage(
        error instanceof Error ? error.message : t("logoutFailed"),
      );
    }
  }

  const formCar = editingCar ?? emptyCar;
  const currentPhotoUrl = editingCar?.photoFilename
    ? `/api/cars/${editingCar.id}/photo`
    : null;

  return (
    <main className="min-h-screen bg-slate-100">
      <header className="border-b border-slate-200 bg-white">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-3 px-5 py-4">
          <div>
            <h1 className="text-xl font-bold text-slate-900">
              {t("vehicleRecords")}
            </h1>
            <p className="text-sm text-slate-500">{email}</p>
          </div>
          <button
            className="rounded-md border border-slate-300 px-4 py-2 text-sm font-medium hover:bg-slate-50"
            type="button"
            onClick={() => void handleLogout()}
          >
            {t("logout")}
          </button>
        </div>
      </header>

      <section className="mx-auto max-w-6xl px-5 py-8">
        <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
          <div>
            <h2 className="text-2xl font-semibold text-slate-900">
              {t("carOwnerDetails")}
            </h2>
            <p className="mt-1 text-sm text-slate-600">
              {cars.length} {t("recordCount")}
            </p>
          </div>
          <button
            className="rounded-md bg-blue-700 px-4 py-2 font-medium text-white hover:bg-blue-800"
            type="button"
            onClick={openCreateForm}
          >
            {t("addVehicle")}
          </button>
        </div>

        <label className="mb-5 block max-w-xl">
          <span className="mb-1 block text-sm font-medium text-slate-700">
            {t("searchLabel")}
          </span>
          <input
            className="w-full rounded-md border border-slate-300 bg-white px-3 py-2"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder={t("searchPlaceholder")}
          />
        </label>

        {errorMessage && !isFormOpen && (
          <p className="mb-4 rounded-md bg-red-50 p-3 text-sm text-red-800" role="alert">
            {errorMessage}
          </p>
        )}

        {isLoading ? (
          <p className="py-12 text-center text-slate-600" role="status">
            {t("loadingCars")}
          </p>
        ) : visibleCars.length === 0 ? (
          <div className="rounded-xl border border-dashed border-slate-300 bg-white p-10 text-center">
            <p className="font-medium text-slate-800">
              {cars.length === 0 ? t("noVehicles") : t("noMatches")}
            </p>
            <p className="mt-1 text-sm text-slate-500">
              {cars.length === 0
                ? t("addVehicleHint")
                : t("searchHint")}
            </p>
          </div>
        ) : (
          <div className="space-y-4">
            {visibleCars.map((car) => (
              <article
                className="grid overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm md:grid-cols-[minmax(16rem,0.8fr)_minmax(0,1.6fr)]"
                key={car.id}
              >
                <div className="relative min-h-52 bg-slate-200 md:min-h-64">
                  {car.photoFilename ? (
                    <Image
                      className="object-cover"
                      src={`/api/cars/${car.id}/photo`}
                      fill
                      sizes="(min-width: 768px) 40vw, 100vw"
                      unoptimized
                      alt={t("platePhotoAlt", {
                        plate: `${car.plateLetters} ${car.plateNumber}`,
                      })}
                    />
                  ) : (
                    <div className="absolute inset-0 flex items-center justify-center text-sm text-slate-500">
                      {t("noPhoto")}
                    </div>
                  )}
                </div>
                <div className="flex min-w-0 flex-col justify-between gap-5 p-5">
                  <div className="grid gap-5 sm:grid-cols-2">
                    <div className="flex items-start justify-between gap-3 sm:col-span-2">
                      <div>
                        <p className="text-lg font-bold text-slate-900">
                          {car.plateLetters} {car.plateNumber}
                        </p>
                        <p className="text-sm text-slate-500">{car.province}</p>
                      </div>
                      <span className="rounded-full bg-slate-100 px-3 py-1 text-xs text-slate-700">
                        {car.color}
                      </span>
                    </div>
                    <div>
                      <p className="text-xs font-medium text-slate-500">
                        {t("vehicleDetails")}
                      </p>
                      <p className="mt-1 text-sm font-medium text-slate-800">
                        {car.brand} {car.model}
                      </p>
                    </div>
                    <div>
                      <p className="text-xs font-medium text-slate-500">
                        {t("ownerDetails")}
                      </p>
                      <p className="mt-1 font-medium text-slate-900">
                        {car.ownerName}
                      </p>
                      <a
                        className="text-sm text-blue-700 underline"
                        href={`tel:${car.ownerPhone}`}
                      >
                        {car.ownerPhone}
                      </a>
                    </div>
                  </div>
                  <div className="flex gap-2 border-t border-slate-100 pt-4 md:justify-end">
                    <button
                      className="flex-1 rounded-md border border-slate-300 px-3 py-2 text-sm font-medium hover:bg-slate-50 md:flex-none md:min-w-28"
                      type="button"
                      onClick={() => openEditForm(car)}
                    >
                      {t("edit")}
                    </button>
                    <button
                      className="flex-1 rounded-md border border-red-200 px-3 py-2 text-sm font-medium text-red-700 hover:bg-red-50 md:flex-none md:min-w-28"
                      type="button"
                      onClick={() => void handleDelete(car)}
                    >
                      {t("delete")}
                    </button>
                  </div>
                </div>
              </article>
            ))}
          </div>
        )}
      </section>

      {isFormOpen && (
        <div
          className="fixed inset-0 z-10 flex items-start justify-center overflow-y-auto bg-slate-950/50 p-4 sm:items-center"
          role="presentation"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget && !isSaving) {
              setIsFormOpen(false);
            }
          }}
        >
          <section
            className="my-auto w-full max-w-2xl rounded-xl bg-white p-6 shadow-xl"
            role="dialog"
            aria-modal="true"
            aria-labelledby="car-form-title"
          >
            <div className="mb-5 flex items-center justify-between gap-4">
              <h2 className="text-xl font-semibold" id="car-form-title">
                {editingCar ? t("editVehicle") : t("addVehicle")}
              </h2>
              <button
                className="rounded px-2 py-1 text-slate-500 hover:bg-slate-100"
                type="button"
                onClick={() => setIsFormOpen(false)}
                disabled={isSaving}
                aria-label={t("closeForm")}
              >
                ✕
              </button>
            </div>

            {errorMessage && (
              <p className="mb-4 rounded-md bg-red-50 p-3 text-sm text-red-800" role="alert">
                {errorMessage}
              </p>
            )}

            <form
              key={editingCar?.id ?? "new"}
              className="space-y-5"
              onSubmit={handleSave}
            >
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                <label>
                  <span className="mb-1 block text-sm text-slate-600">
                    {t("plateCategory")}
                  </span>
                  <input
                    className="w-full rounded-md border border-slate-300 px-3 py-2"
                    name="plateLetters"
                    defaultValue={formCar.plateLetters}
                    pattern="(?=.*[ก-ฮ])[ก-ฮ0-9]{2}"
                    maxLength={2}
                    required
                  />
                </label>
                <label>
                  <span className="mb-1 block text-sm text-slate-600">
                    {t("plateNumber")}
                  </span>
                  <input
                    className="w-full rounded-md border border-slate-300 px-3 py-2"
                    name="plateNumber"
                    defaultValue={formCar.plateNumber}
                    inputMode="numeric"
                    pattern="[0-9]{1,4}"
                    maxLength={4}
                    required
                  />
                </label>
                <label>
                  <span className="mb-1 block text-sm text-slate-600">
                    {t("province")}
                  </span>
                  <select
                    className="w-full rounded-md border border-slate-300 bg-white px-3 py-2"
                    name="province"
                    defaultValue={formCar.province}
                    required
                  >
                    <option value="">เลือกจังหวัด</option>
                    {!thaiProvinces.includes(
                      formCar.province as (typeof thaiProvinces)[number],
                    ) &&
                      formCar.province && (
                        <option value={formCar.province}>
                          {formCar.province} (ข้อมูลเดิม)
                        </option>
                      )}
                    {provinceGroups.map((group) => (
                      <optgroup key={group.label} label={group.label}>
                        {group.provinces.map((province) => (
                          <option key={province} value={province}>
                            {province}
                          </option>
                        ))}
                      </optgroup>
                    ))}
                  </select>
                </label>
              </div>

              <datalist id="car-brand-options">
                {carBrands.map((brand) => (
                  <option key={brand} value={brand} />
                ))}
              </datalist>
              <datalist id="car-model-options">
                {getModelsForBrand(selectedBrand).map((model) => (
                  <option key={model} value={model} />
                ))}
              </datalist>

              <fieldset>
                <legend className="mb-3 font-medium text-slate-800">
                  {t("ownerDetails")}
                </legend>
                <div className="grid gap-3 sm:grid-cols-2">
                  <label>
                    <span className="mb-1 block text-sm text-slate-600">
                      {t("ownerName")}
                    </span>
                    <input
                      className="w-full rounded-md border border-slate-300 px-3 py-2"
                      name="ownerName"
                      defaultValue={formCar.ownerName}
                      maxLength={150}
                      required
                    />
                  </label>
                  <label>
                    <span className="mb-1 block text-sm text-slate-600">
                      {t("phoneNumber")}
                    </span>
                    <input
                      className="w-full rounded-md border border-slate-300 px-3 py-2"
                      name="ownerPhone"
                      type="tel"
                      autoComplete="tel"
                      defaultValue={formCar.ownerPhone}
                      maxLength={30}
                      required
                    />
                  </label>
                </div>
              </fieldset>

              <fieldset>
                <legend className="mb-3 font-medium text-slate-800">
                  {t("vehicleDetails")}
                </legend>
                <div className="grid gap-3 sm:grid-cols-3">
                  <label>
                    <span className="mb-1 block text-sm text-slate-600">
                      {t("brand")}
                    </span>
                    <input
                      className="w-full rounded-md border border-slate-300 px-3 py-2"
                      name="brand"
                      defaultValue={formCar.brand}
                      list="car-brand-options"
                      onChange={(event) =>
                        setSelectedBrand(event.currentTarget.value)
                      }
                      maxLength={100}
                      required
                    />
                    <span className="mt-1 block text-xs text-slate-500">
                      {t("typeToSearchOrEnter")}
                    </span>
                  </label>
                  <label>
                    <span className="mb-1 block text-sm text-slate-600">
                      {t("model")}
                    </span>
                    <input
                      className="w-full rounded-md border border-slate-300 px-3 py-2"
                      name="model"
                      defaultValue={formCar.model}
                      list="car-model-options"
                      maxLength={100}
                      required
                    />
                    <span className="mt-1 block text-xs text-slate-500">
                      {t("typeToSearchOrEnter")}
                    </span>
                  </label>
                  <label>
                    <span className="mb-1 block text-sm text-slate-600">
                      {t("color")}
                    </span>
                    <select
                      className="w-full rounded-md border border-slate-300 bg-white px-3 py-2"
                      name="color"
                      value={selectedColor}
                      onChange={(event) =>
                        setSelectedColor(event.currentTarget.value)
                      }
                      required
                    >
                      <option value="">เลือกกลุ่มสี</option>
                      {colorGroups.map((group) => (
                        <optgroup key={group.label} label={group.label}>
                          {group.colors.map((color) => (
                            <option key={color} value={color}>
                              {color}
                            </option>
                          ))}
                        </optgroup>
                      ))}
                      <option value="__custom__">สีอื่น ๆ</option>
                    </select>
                    {selectedColor === "__custom__" && (
                      <input
                        className="mt-2 w-full rounded-md border border-slate-300 px-3 py-2"
                        name="customColor"
                        defaultValue={
                          carColors.some((color) => color === formCar.color)
                            ? ""
                            : formCar.color
                        }
                        maxLength={50}
                        placeholder="ระบุสีรถ"
                        aria-label="ระบุสีรถ"
                        required
                      />
                    )}
                  </label>
                </div>
              </fieldset>

              <fieldset>
                <legend className="mb-2 font-medium text-slate-800">
                  {t("carPhoto")}
                </legend>
                <div className="flex flex-wrap items-center gap-3">
                  <input
                    className="peer sr-only"
                    id="car-photo-upload"
                    type="file"
                    name="photo"
                    accept="image/jpeg,image/png,image/webp"
                    aria-label={t("selectPhoto")}
                    onChange={(event) => {
                      const file = event.target.files?.[0] ?? null;
                      setPhotoFile(file);
                      setPhotoPreview(file ? URL.createObjectURL(file) : null);
                      setRemovePhoto(false);
                    }}
                  />
                  <label
                    className="cursor-pointer rounded-md bg-slate-100 px-3 py-2 text-sm text-slate-700 hover:bg-slate-200 peer-focus-visible:outline peer-focus-visible:outline-2 peer-focus-visible:outline-blue-700"
                    htmlFor="car-photo-upload"
                  >
                    {t("selectPhoto")}
                  </label>
                  <span className="break-all text-sm text-slate-600">
                    {photoFile?.name ?? t("noPhotoSelected")}
                  </span>
                </div>
                <p className="mt-1 text-xs text-slate-500">
                  {t("photoHelp")}
                </p>
                {(photoPreview || currentPhotoUrl) && (
                  <Image
                    className="mt-3 h-36 w-56 rounded-md object-cover"
                    src={photoPreview ?? currentPhotoUrl!}
                    width={224}
                    height={144}
                    unoptimized
                    alt={t("photoPreview")}
                  />
                )}
                {editingCar?.photoFilename && !photoFile && (
                  <label className="mt-3 flex items-center gap-2 text-sm text-slate-700">
                    <input
                      type="checkbox"
                      checked={removePhoto}
                      onChange={(event) => setRemovePhoto(event.target.checked)}
                    />
                    {t("removePhoto")}
                  </label>
                )}
              </fieldset>

              <div className="flex justify-end gap-3 border-t border-slate-100 pt-4">
                <button
                  className="rounded-md border border-slate-300 px-4 py-2 text-sm"
                  type="button"
                  onClick={() => setIsFormOpen(false)}
                  disabled={isSaving}
                >
                  {t("cancel")}
                </button>
                <button
                  className="rounded-md bg-blue-700 px-4 py-2 text-sm font-medium text-white disabled:opacity-60"
                  type="submit"
                  disabled={isSaving}
                >
                  {isSaving ? t("saving") : t("saveVehicle")}
                </button>
              </div>
            </form>
          </section>
        </div>
      )}
    </main>
  );
}
