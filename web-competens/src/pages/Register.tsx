import { useState } from "react";
import { Link } from "react-router-dom";
import { useAuth } from "@/hooks/use-auth";
import { useI18n } from "@/i18n";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { GraduationCap, UserPlus, AlertCircle, CheckCircle2, Users } from "lucide-react";
import { cn } from "@/lib/utils";

type RegisterMode = "professeur" | "parent";

export default function RegisterPage() {
  const { registerTeacher, registerParent } = useAuth();
  const { t, lang, setLang } = useI18n();
  const [mode, setMode] = useState<RegisterMode>("professeur");
  const [form, setForm] = useState({
    firstName: "", lastName: "", email: "", phone: "", password: "", confirmPassword: "",
  });
  const [error, setError] = useState("");
  const [success, setSuccess] = useState(false);
  const [isLoading, setIsLoading] = useState(false);

  const set = (field: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement>) =>
    setForm((prev) => ({ ...prev, [field]: e.target.value }));

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    if (form.password !== form.confirmPassword) { setError(t("register.passwordMismatch")); return; }
    if (form.password.length < 6) { setError(t("register.passwordTooShort")); return; }
    setIsLoading(true);
    try {
      const payload = {
        email: form.email, password: form.password,
        firstName: form.firstName, lastName: form.lastName,
        phone: form.phone || undefined,
      };
      if (mode === "professeur") await registerTeacher(payload);
      else await registerParent(payload);
      setSuccess(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : t("register.errorGeneric"));
    } finally {
      setIsLoading(false);
    }
  };

  if (success) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-primary/5 via-background to-primary/10 p-4">
        <div className="w-full max-w-md text-center space-y-4">
          <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-green-500 shadow-lg mb-2">
            <CheckCircle2 className="w-8 h-8 text-white" />
          </div>
          <h2 className="text-xl font-bold text-foreground">{t("register.successTitle")}</h2>
          <p className="text-muted-foreground text-sm">
            {t("register.successBody", { role: mode === "parent" ? t("register.roleParent") : t("register.roleTeacher") })}
          </p>
          <Link to="/login"><Button className="w-full mt-4">{t("register.backToLogin")}</Button></Link>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-primary/5 via-background to-primary/10 p-4">
      <div className="w-full max-w-md">
        {/* Language toggle */}
        <div className="flex justify-end mb-2">
          <Button variant="ghost" size="sm" className="gap-1.5" onClick={() => setLang(lang === "ar" ? "fr" : "ar")}>
            <span className="text-xs font-bold">{lang === "ar" ? "Français" : "العربية"}</span>
          </Button>
        </div>

        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-primary shadow-lg shadow-primary/25 mb-4">
            <GraduationCap className="w-8 h-8 text-primary-foreground" />
          </div>
          <h1 className="text-2xl font-bold text-foreground tracking-tight">Compétens</h1>
          <p className="text-sm text-muted-foreground mt-1">{t("register.createAccount")}</p>
        </div>

        {/* Role toggle */}
        <div className="flex rounded-xl border border-border bg-muted/40 p-1 mb-4 gap-1">
          <button
            type="button"
            onClick={() => setMode("professeur")}
            className={cn(
              "flex-1 flex items-center justify-center gap-2 py-2.5 rounded-lg text-sm font-medium transition-all",
              mode === "professeur"
                ? "bg-background shadow-sm text-foreground"
                : "text-muted-foreground hover:text-foreground"
            )}
          >
            <GraduationCap className="w-4 h-4" /> {t("register.teacher")}
          </button>
          <button
            type="button"
            onClick={() => setMode("parent")}
            className={cn(
              "flex-1 flex items-center justify-center gap-2 py-2.5 rounded-lg text-sm font-medium transition-all",
              mode === "parent"
                ? "bg-background shadow-sm text-foreground"
                : "text-muted-foreground hover:text-foreground"
            )}
          >
            <Users className="w-4 h-4" /> {t("register.parent")}
          </button>
        </div>

        <Card className="shadow-xl border-border/50">
          <CardHeader className="pb-4">
            <CardTitle className="text-lg flex items-center gap-2">
              <UserPlus className="w-5 h-5 text-primary" />
              {mode === "parent" ? t("register.createParent") : t("register.createTeacher")}
            </CardTitle>
            <CardDescription>
              {mode === "parent" ? t("register.descParent") : t("register.descTeacher")}
            </CardDescription>
          </CardHeader>
          <CardContent>
            {error && (
              <div className="flex items-center gap-2 p-3 mb-4 rounded-lg bg-destructive/10 text-destructive text-sm border border-destructive/20">
                <AlertCircle className="w-4 h-4 shrink-0" />
                {error}
              </div>
            )}
            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-2">
                  <Label htmlFor="firstName">{t("register.firstName")}</Label>
                  <Input id="firstName" placeholder={t("register.firstName")} value={form.firstName} onChange={set("firstName")} required className="h-11" />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="lastName">{t("register.lastName")}</Label>
                  <Input id="lastName" placeholder={t("register.lastName")} value={form.lastName} onChange={set("lastName")} required className="h-11" />
                </div>
              </div>
              <div className="space-y-2">
                <Label htmlFor="email">{t("login.email")}</Label>
                <Input id="email" type="email" placeholder="votre@email.com" value={form.email} onChange={set("email")} required className="h-11" dir="ltr" />
              </div>
              <div className="space-y-2">
                <Label htmlFor="phone">{t("register.phone")}</Label>
                <Input id="phone" type="tel" placeholder="+212 6 00 00 00 00" value={form.phone} onChange={set("phone")} className="h-11" dir="ltr" />
              </div>
              <div className="space-y-2">
                <Label htmlFor="password">{t("login.password")}</Label>
                <Input id="password" type="password" placeholder="••••••••" value={form.password} onChange={set("password")} required className="h-11" dir="ltr" />
              </div>
              <div className="space-y-2">
                <Label htmlFor="confirmPassword">{t("register.confirmPassword")}</Label>
                <Input id="confirmPassword" type="password" placeholder="••••••••" value={form.confirmPassword} onChange={set("confirmPassword")} required className="h-11" dir="ltr" />
              </div>
              <Button type="submit" className="w-full h-11 font-semibold" disabled={isLoading}>
                {isLoading ? t("register.submitting") : t("register.submit")}
              </Button>
            </form>
            <p className="text-center text-sm text-muted-foreground mt-4">
              {t("register.haveAccount")}{" "}
              <Link to="/login" className="text-primary font-medium hover:underline">{t("register.signIn")}</Link>
            </p>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
