"use client";

import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  type ReactNode,
} from "react";

const messages = {
  loadingSession: "กำลังตรวจสอบการเข้าสู่ระบบ...",
  createAccount: "สร้างบัญชี",
  login: "เข้าสู่ระบบ",
  email: "อีเมล",
  password: "รหัสผ่าน",
  minPassword: "ใช้รหัสผ่านอย่างน้อย 8 ตัวอักษร",
  pleaseWait: "กรุณารอสักครู่...",
  needAccount: "ยังไม่มีบัญชี? สมัครสมาชิก",
  haveAccount: "มีบัญชีอยู่แล้ว? เข้าสู่ระบบ",
  checkLoginError: "ตรวจสอบการเข้าสู่ระบบไม่สำเร็จ กรุณาลองอีกครั้ง",
  connectionError: "เชื่อมต่อเซิร์ฟเวอร์ไม่ได้ กรุณาลองอีกครั้ง",
  signInError: "เข้าสู่ระบบไม่สำเร็จ กรุณาลองอีกครั้ง",
  logoutError: "ออกจากระบบไม่สำเร็จ กรุณาลองอีกครั้ง",
  vehicleRecords: "จัดการข้อมูลรถ",
  logout: "ออกจากระบบ",
  carOwnerDetails: "ข้อมูลรถและเจ้าของ",
  recordCount: "รายการ",
  addVehicle: "เพิ่มรถ",
  searchLabel: "ค้นหาทะเบียน ชื่อเจ้าของ หรือรถ",
  searchPlaceholder: "พิมพ์คำค้นหา",
  loadingCars: "กำลังโหลดข้อมูลรถ...",
  noVehicles: "ยังไม่มีข้อมูลรถ",
  noMatches: "ไม่พบข้อมูลที่ค้นหา",
  addVehicleHint: "กดเพิ่มรถเพื่อเริ่มบันทึกข้อมูล",
  searchHint: "ลองค้นหาด้วยคำอื่น",
  noPhoto: "ไม่มีรูปรถ",
  edit: "แก้ไข",
  delete: "ลบ",
  editVehicle: "แก้ไขข้อมูลรถ",
  licensePlate: "ป้ายทะเบียน",
  plateCategory: "หมวดอักษร",
  plateNumber: "เลขทะเบียน",
  province: "จังหวัด",
  ownerDetails: "ข้อมูลเจ้าของ",
  ownerName: "ชื่อเจ้าของ",
  phoneNumber: "เบอร์โทรศัพท์",
  vehicleDetails: "ข้อมูลรถ",
  brand: "ยี่ห้อ",
  model: "รุ่น",
  typeToSearchOrEnter: "พิมพ์เพื่อค้นหาหรือกรอกเอง",
  color: "สีรถ",
  carPhoto: "รูปรถ",
  selectPhoto: "เลือกรูปภาพ",
  noPhotoSelected: "ยังไม่ได้เลือกรูป",
  photoHelp: "ไฟล์ .jpg, .png หรือ .webp ขนาดไม่เกิน 5 MB",
  photoPreview: "ตัวอย่างรูปรถ",
  platePhotoAlt: "รูปรถทะเบียน {plate}",
  removePhoto: "ลบรูปรถปัจจุบัน",
  cancel: "ยกเลิก",
  saving: "กำลังบันทึก...",
  saveVehicle: "บันทึกข้อมูล",
  closeForm: "ปิดแบบฟอร์ม",
  confirmDelete: "ต้องการลบทะเบียน {plate} ({province}) หรือไม่?",
  deleteFailed: "ลบข้อมูลรถไม่สำเร็จ",
  saveFailed: "บันทึกข้อมูลรถไม่สำเร็จ",
  loadFailed: "โหลดข้อมูลรถไม่สำเร็จ",
  logoutFailed: "ออกจากระบบไม่สำเร็จ",
  apiSignIn: "กรุณาเข้าสู่ระบบ",
  invalidRecord: "ข้อมูลรถไม่ถูกต้อง",
  recordNotFound: "ไม่พบข้อมูลรถ",
  duplicatePlate: "ทะเบียนรถนี้มีอยู่ในระบบแล้ว",
  fillAllFields: "กรุณากรอกข้อมูลรถและเจ้าของให้ครบ",
  invalidPlateCategory: "หมวดอักษรต้องมี 2 ตัว และมีอักษรไทยอย่างน้อย 1 ตัว",
  invalidPlateNumber: "เลขทะเบียนต้องเป็นตัวเลข 1–4 หลัก",
  invalidPlate: "รูปแบบป้ายทะเบียนไม่ถูกต้อง",
  invalidPhone: "กรุณากรอกเบอร์โทรเจ้าของให้ถูกต้อง",
  invalidFields: "มีข้อมูลบางช่องไม่ถูกต้องหรือยาวเกินกำหนด",
  invalidPhoto: "ไฟล์รูปภาพไม่ถูกต้อง",
  photoTooLarge: "รูปภาพต้องมีขนาดไม่เกิน 5 MB",
  validPhoto: "กรุณาอัปโหลดไฟล์รูป JPEG, PNG หรือ WebP",
  chooseOnePhotoAction: "เลือกรูปใหม่หรือลบรูปปัจจุบันอย่างใดอย่างหนึ่ง",
  formReadFailed: "อ่านข้อมูลแบบฟอร์มไม่สำเร็จ",
  saveUnavailable: "บันทึกข้อมูลรถไม่สำเร็จ กรุณาลองอีกครั้ง",
  updateUnavailable: "แก้ไขข้อมูลรถไม่สำเร็จ กรุณาลองอีกครั้ง",
  deleteUnavailable: "ลบข้อมูลรถไม่สำเร็จ กรุณาลองอีกครั้ง",
  loadUnavailable: "โหลดข้อมูลรถไม่สำเร็จ กรุณาลองอีกครั้ง",
  photoNotFound: "ไม่พบรูปภาพ",
  photoUnavailable: "ไม่สามารถเปิดไฟล์รูปภาพได้",
  photoLoadUnavailable: "โหลดรูปภาพไม่สำเร็จ กรุณาลองอีกครั้ง",
  authRequired: "กรุณากรอกอีเมลและรหัสผ่านให้ถูกต้อง",
  passwordShort: "รหัสผ่านต้องมีอย่างน้อย 8 ตัวอักษร",
  wrongCredentials: "อีเมลหรือรหัสผ่านไม่ถูกต้อง",
  duplicateEmail: "อีเมลนี้มีบัญชีผู้ใช้แล้ว",
  loginUnavailable: "เข้าสู่ระบบไม่ได้ กรุณาลองอีกครั้ง",
  registrationUnavailable: "สมัครสมาชิกไม่ได้ กรุณาลองอีกครั้ง",
  logoutUnavailable: "ออกจากระบบไม่ได้ กรุณาลองอีกครั้ง",
  authUnavailable: "ระบบยืนยันตัวตนใช้งานไม่ได้ กรุณาลองอีกครั้ง",
} as const;

type MessageKey = keyof typeof messages;

const errorKeys: Record<string, MessageKey> = {
  "Could not load vehicle records.": "loadFailed",
  "Could not load vehicle records. Please try again.": "loadUnavailable",
  "Could not save this vehicle.": "saveFailed",
  "Could not save this vehicle. Please try again.": "saveUnavailable",
  "Could not update this vehicle. Please try again.": "updateUnavailable",
  "Could not delete this vehicle.": "deleteFailed",
  "Could not delete this vehicle. Please try again.": "deleteUnavailable",
  "Could not connect to the server. Please try again.": "connectionError",
  "Could not log out.": "logoutFailed",
  "Please sign in.": "apiSignIn",
  "Not signed in.": "apiSignIn",
  "Invalid vehicle record.": "invalidRecord",
  "Vehicle record not found.": "recordNotFound",
  "This license plate is already registered.": "duplicatePlate",
  "Please fill in all vehicle and owner fields.": "fillAllFields",
  "Invalid license plate format.": "invalidPlate",
  "Plate category must contain 2 characters including a Thai letter.":
    "invalidPlateCategory",
  "Plate number must contain 1 to 4 digits.": "invalidPlateNumber",
  "Enter valid license plate letters.": "invalidPlate",
  "Enter a valid owner phone number (8 to 30 characters).": "invalidPhone",
  "One or more fields are invalid or too long.": "invalidFields",
  "The uploaded photo is invalid.": "invalidPhoto",
  "Photo must be 5 MB or smaller.": "photoTooLarge",
  "Upload a valid JPEG, PNG, or WebP image.": "validPhoto",
  "Choose a new photo or remove the current one.": "chooseOnePhotoAction",
  "Could not read the submitted form.": "formReadFailed",
  "Photo not found.": "photoNotFound",
  "Photo file is unavailable.": "photoUnavailable",
  "Could not load this photo. Please try again.": "photoLoadUnavailable",
  "Enter a valid email and password.": "authRequired",
  "Password must be at least 8 characters.": "passwordShort",
  "Email or password is incorrect.": "wrongCredentials",
  "An account with this email already exists.": "duplicateEmail",
  "Login is unavailable. Please try again later.": "loginUnavailable",
  "Registration is unavailable. Please try again later.":
    "registrationUnavailable",
  "Logout is unavailable. Please try again later.": "logoutUnavailable",
  "Authentication is unavailable. Please try again later.": "authUnavailable",
};

type LanguageContextValue = {
  t: (key: MessageKey, values?: Record<string, string>) => string;
  localizeError: (message: string) => string;
};

const LanguageContext = createContext<LanguageContextValue | null>(null);

export function LanguageProvider({ children }: { children: ReactNode }) {
  const t = useCallback((key: MessageKey, values?: Record<string, string>) => {
    let message: string = messages[key];
    if (values) {
      for (const [name, value] of Object.entries(values)) {
        message = message.replaceAll(`{${name}}`, value);
      }
    }
    return message;
  }, []);

  const localizeError = useCallback(
    (message: string) => {
      const key = errorKeys[message];
      return key ? t(key) : messages.signInError;
    },
    [t],
  );

  const value = useMemo(() => ({ t, localizeError }), [t, localizeError]);
  return (
    <LanguageContext.Provider value={value}>
      {children}
    </LanguageContext.Provider>
  );
}

export function useLanguage() {
  const context = useContext(LanguageContext);
  if (!context) {
    throw new Error("useLanguage must be used within a LanguageProvider.");
  }
  return context;
}
