import { useMemo, useState } from "react";
import { useDashboard } from "@/hooks/use-dashboard";
import { useAuth } from "@/hooks/use-auth";
import { useCelebrationSettings } from "@/hooks/use-celebration-settings";
import { useI18n } from "@/i18n";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { HonorRoll } from "@/components/HonorRoll";
import {
  Users, Building2, UserCog, ClipboardCheck,
  Bell, Activity, Loader2, Star,
} from "lucide-react";
import {
  ResponsiveContainer, BarChart, Bar, XAxis, YAxis, CartesianGrid,
  Tooltip, Cell,
} from "recharts";

export default function DashboardPage() {
  const { t } = useI18n();
  const { user } = useAuth();
  const canManageHonorRoll = user?.role === "admin" || user?.role === "directeur";
  const { isPublished } = useCelebrationSettings();
  const [showHonorRoll, setShowHonorRoll] = useState(false);
  const {
    totalStudents, totalClasses, totalTeachers, totalEvaluations,
    activeYear, weeklyData, alerts, loading, error,
  } = useDashboard();

  const stats = useMemo(() => [
    { label: t("dashboard.students"),     value: totalStudents,    icon: Users,          color: "text-blue-500",   bg: "bg-blue-500/10" },
    { label: t("dashboard.classes"),      value: totalClasses,     icon: Building2,      color: "text-emerald-500", bg: "bg-emerald-500/10" },
    { label: t("dashboard.teachers"),     value: totalTeachers,    icon: UserCog,        color: "text-violet-500", bg: "bg-violet-500/10" },
    { label: t("dashboard.evaluations"),  value: totalEvaluations, icon: ClipboardCheck, color: "text-amber-500",  bg: "bg-amber-500/10" },
  ], [totalStudents, totalClasses, totalTeachers, totalEvaluations, t]);

  return (
    <div className="space-y-6 animate-in fade-in duration-500">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">{t("dashboard.title")}</h1>
          <p className="text-sm text-muted-foreground">
            {loading ? t("common.loading") : activeYear ? t("dashboard.schoolYear", { name: activeYear.name }) : t("dashboard.noActiveYear")}
          </p>
          <p className="mt-1 max-w-2xl text-xs leading-5 text-muted-foreground">{t("dashboard.generalInfo")}</p>
        </div>
        {canManageHonorRoll && (
          <Button
            size="sm"
            variant={showHonorRoll ? "default" : "outline"}
            onClick={() => setShowHonorRoll((v) => !v)}
            className="gap-1.5 shrink-0"
          >
            <Star className={showHonorRoll ? "w-3.5 h-3.5 fill-current" : "w-3.5 h-3.5"} />
            {t("honorRoll.title")}
          </Button>
        )}
      </div>

      {canManageHonorRoll && showHonorRoll && <HonorRoll isAdmin />}

      {/* Teachers and parents only see the celebration after management publishes it. */}
      {!canManageHonorRoll && isPublished && <HonorRoll isAdmin={false} />}

      {error && (
        <div className="p-3 rounded-lg bg-destructive/10 text-destructive text-sm">{error}</div>
      )}

      {/* Stats Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 md:gap-4">
        {stats.map((stat) => (
          <Card key={stat.label} className="border-border/50 hover:shadow-md transition-shadow">
            <CardContent className="p-4 md:p-5">
              <div className="flex items-start justify-between">
                <div>
                  <p className="text-xs md:text-sm text-muted-foreground">{stat.label}</p>
                  <p className="text-2xl md:text-3xl font-bold text-foreground mt-1 font-mono">
                    {loading ? <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" /> : stat.value.toLocaleString()}
                  </p>
                </div>
                <div className={`w-10 h-10 md:w-12 md:h-12 rounded-xl flex items-center justify-center ${stat.bg}`}>
                  <stat.icon className={`w-5 h-5 md:w-6 md:h-6 ${stat.color}`} />
                </div>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      <div className="grid lg:grid-cols-3 gap-4 md:gap-6">
        {/* Activity Chart */}
        <Card className="lg:col-span-2 border-border/50">
          <CardHeader className="pb-2">
            <CardTitle className="text-base font-semibold flex items-center gap-2">
              <Activity className="w-4 h-4 text-primary" /> {t("dashboard.activity7")}
            </CardTitle>
          </CardHeader>
          <CardContent className="pt-2">
            <div className="h-[200px] md:h-[240px]">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={weeklyData} margin={{ top: 5, right: 5, left: -20, bottom: 5 }}>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="hsl(var(--border))" />
                  <XAxis dataKey="day" tick={{ fontSize: 12 }} stroke="hsl(var(--muted-foreground))" />
                  <YAxis tick={{ fontSize: 12 }} stroke="hsl(var(--muted-foreground))" allowDecimals={false} />
                  <Tooltip
                    contentStyle={{
                      backgroundColor: "hsl(var(--card))",
                      border: "1px solid hsl(var(--border))",
                      borderRadius: "8px",
                      fontSize: "13px",
                    }}
                    labelStyle={{ fontWeight: 600 }}
                  />
                  <Bar dataKey="count" radius={[6, 6, 0, 0]} maxBarSize={40}>
                    {weeklyData.map((_, i) => (
                      <Cell key={i} fill="hsl(220 99% 62%)" fillOpacity={0.85} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>

        {/* Alerts */}
        <Card className="border-border/50">
          <CardHeader className="pb-2">
            <CardTitle className="text-base font-semibold flex items-center gap-2">
              <Bell className="w-4 h-4 text-warning" /> {t("dashboard.recentAlerts")}
            </CardTitle>
          </CardHeader>
          <CardContent className="pt-2 space-y-3">
            {loading ? (
              <div className="flex justify-center py-6">
                <Loader2 className="w-5 h-5 animate-spin text-muted-foreground" />
              </div>
            ) : alerts.length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-6">{t("dashboard.noAlerts")}</p>
            ) : (
              alerts.slice(0, 5).map((a) => (
                <div key={a.id} className="flex items-center gap-3 rounded-xl bg-muted/40 p-3">
                  <div className={`w-2 h-2 rounded-full shrink-0 ${a.level === "critical" ? "bg-destructive" : "bg-warning"}`} />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium truncate">
                      {a.level === "critical" ? t("dashboard.criticalAlert") : t("dashboard.warningAlert")}
                    </p>
                    {a.date && <p className="text-xs text-muted-foreground">{a.date}</p>}
                  </div>
                </div>
              ))
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
