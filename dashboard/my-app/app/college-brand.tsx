import Image from "next/image";

type CollegeBrandProps = {
  subtitle: string;
  size?: "header" | "login";
};

export default function CollegeBrand({
  subtitle,
  size = "header",
}: CollegeBrandProps) {
  const isLoginSize = size === "login";

  return (
    <div
      className={`flex items-center gap-3 ${
        isLoginSize ? "flex-col text-center" : "min-w-0"
      }`}
    >
      <Image
        className={`shrink-0 rounded-full bg-white object-contain ring-1 ring-slate-200 ${
          isLoginSize ? "size-24" : "size-12"
        }`}
        src="/suphanburi-vocational-college.png"
        alt="ตราวิทยาลัยอาชีวศึกษาสุพรรณบุรี"
        width={isLoginSize ? 96 : 48}
        height={isLoginSize ? 96 : 48}
        priority
      />
      <div className={isLoginSize ? "max-w-xs" : "min-w-0"}>
        <p
          className={`font-semibold text-slate-900 ${
            isLoginSize ? "text-lg" : "text-sm"
          }`}
        >
          วิทยาลัยอาชีวศึกษาสุพรรณบุรี
        </p>
        <p className="break-words text-sm text-slate-500">{subtitle}</p>
      </div>
    </div>
  );
}
