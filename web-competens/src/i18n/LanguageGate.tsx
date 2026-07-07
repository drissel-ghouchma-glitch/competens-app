import { useI18n } from "@/i18n";
import { GraduationCap, Check, ArrowRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { Lang } from "@/i18n/translations";

/**
 * Full-screen language chooser shown before the login flow on every app open.
 * French is the default; Arabic switches the whole app to RTL.
 */
export default function LanguageGate() {
  const { lang, setLang, markPicked, t } = useI18n();

  const options: { value: Lang; label: string; sub: string }[] = [
    { value: "fr", label: "Français", sub: "Langue par défaut" },
    { value: "ar", label: "العربية", sub: "اللغة العربية" },
  ];

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-primary/5 via-background to-primary/10 p-4">
      <div className="w-full max-w-md text-center">
        {/* Logo */}
        <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-primary shadow-lg shadow-primary/25 mb-4">
          <GraduationCap className="w-8 h-8 text-primary-foreground" />
        </div>
        <h1 className="text-2xl font-bold text-foreground tracking-tight">Compétens</h1>
        <p className="text-sm text-muted-foreground mt-1 mb-8">{t("gate.subtitle")}</p>

        {/* Options */}
        <div className="grid gap-3">
          {options.map((opt) => {
            const active = lang === opt.value;
            return (
              <button
                key={opt.value}
                type="button"
                dir={opt.value === "ar" ? "rtl" : "ltr"}
                onClick={() => setLang(opt.value)}
                className={`flex items-center justify-between gap-3 px-5 py-4 rounded-2xl border-2 transition-all text-start ${
                  active
                    ? "border-primary bg-primary/5 shadow-sm"
                    : "border-border bg-card hover:border-primary/40"
                }`}
              >
                <div>
                  <p className="text-lg font-bold text-foreground">{opt.label}</p>
                  <p className="text-xs text-muted-foreground mt-0.5">{opt.sub}</p>
                </div>
                <span
                  className={`w-6 h-6 rounded-full flex items-center justify-center shrink-0 ${
                    active ? "bg-primary text-primary-foreground" : "border border-border"
                  }`}
                >
                  {active && <Check className="w-4 h-4" />}
                </span>
              </button>
            );
          })}
        </div>

        <Button className="w-full h-11 mt-8 font-semibold gap-2" onClick={markPicked}>
          {t("gate.continue")} <ArrowRight className="w-4 h-4 rtl:rotate-180" />
        </Button>

        <p className="text-xs text-muted-foreground mt-4">{t("gate.hint")}</p>
      </div>
    </div>
  );
}
