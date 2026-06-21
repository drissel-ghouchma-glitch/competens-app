import { useMemo } from "react";
import { Link } from "react-router-dom";
import { useDashboard } from "@/hooks/use-dashboard";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Users, Building2, UserCog, ClipboardCheck, TrendingUp,
  Bell, ArrowRight, ChevronRight, Activity, Loader2,
} from "lucide-react";
import {
  ResponsiveContainer, BarChart, Bar, XAxis, YAxis, CartesianGrid,
  Tooltip, Cell,
} from "recharts";

export default function DashboardPage() {
  const {
    totalStudents, totalClasses, totalTeachers, totalEvaluations,
    activeYear, weeklyData, alerts, loading, error,
  } = useDashboard();

  const stats = useMemo(() => [
    { label: "Élèves",      value: totalStudents,    icon: Users,          color: "text-blue-500",   bg: "bg-blue-500/10" },
    { label: "Classes",     value: totalClasses,     icon: Building2,      color: "text-emerald-500", bg: "bg-emerald-500/10" },
    { label: "Professeurs", value: totalTeachers,    icon: UserCog,        color: "text-violet-500", bg: "bg-violet-500/10" },
    { label: "Évaluations", value: totalEvaluations, icon: ClipboardCheck, color: "text-amber-500",  bg: "bg-amber-500/10" },
  ], [totalStudents, totalClasses, totalTeachers, totalEvaluations]);

  return (
    <div className="space-y-6 animate-in fade-in duration-500">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Dashboard</h1>
          <p className="text-sm text-muted-foreground">
            {loading ? "Chargement…" : activeYear ? `Année scolaire ${activeYear.name}` : "Aucune année active"}
          </p>
        </div>
      </div>

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
              <Activity className="w-4 h-4 text-primary" /> Activité (7 jours)
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
            <div className="flex items-center justify-between">
              <CardTitle className="text-base font-semibold flex items-center gap-2">
                <Bell className="w-4 h-4 text-warning" /> Alertes récentes
              </CardTitle>
              {alerts.length > 0 && (
                <Link to="/alerts">
                  <Badge variant="outline" className="text-xs gap-1">
                    Voir tout <ChevronRight className="w-3 h-3" />
                  </Badge>
                </Link>
              )}
            </div>
          </CardHeader>
          <CardContent className="pt-2 space-y-3">
            {loading ? (
              <div className="flex justify-center py-6">
                <Loader2 className="w-5 h-5 animate-spin text-muted-foreground" />
              </div>
            ) : alerts.length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-6">Aucune alerte en cours</p>
            ) : (
              alerts.slice(0, 5).map((a) => (
                <Link
                  key={a.id}
                  to={`/students/${a.studentId}`}
                  className="flex items-center gap-3 p-3 rounded-xl bg-muted/40 hover:bg-muted transition-colors"
                >
                  <div className={`w-2 h-2 rounded-full shrink-0 ${a.level === "critical" ? "bg-destructive" : "bg-warning"}`} />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium truncate">
                      {a.student?.firstName} {a.student?.lastName}
                    </p>
                    <p className="text-xs text-muted-foreground truncate">{a.cause}</p>
                  </div>
                </Link>
              ))
            )}
          </CardContent>
        </Card>
      </div>

      {/* Quick Access */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {[
          { to: "/classes",      label: "Classes",     icon: Building2,      bg: "from-emerald-500/20 to-emerald-500/5", text: "text-emerald-600 dark:text-emerald-400" },
          { to: "/students",     label: "Élèves",      icon: Users,          bg: "from-blue-500/20 to-blue-500/5",       text: "text-blue-600 dark:text-blue-400" },
          { to: "/competencies", label: "Compétences", icon: TrendingUp,     bg: "from-violet-500/20 to-violet-500/5",   text: "text-violet-600 dark:text-violet-400" },
          { to: "/evaluation",   label: "Évaluer",     icon: ClipboardCheck, bg: "from-amber-500/20 to-amber-500/5",     text: "text-amber-600 dark:text-amber-400" },
        ].map((item) => (
          <Link key={item.to} to={item.to}>
            <Card className="border-border/50 hover:shadow-lg hover:-translate-y-0.5 transition-all cursor-pointer overflow-hidden">
              <CardContent className="p-4 md:p-5 relative">
                <div className={`absolute top-0 right-0 w-20 h-20 rounded-bl-[80px] bg-gradient-to-bl ${item.bg}`} />
                <div className={`w-10 h-10 rounded-xl flex items-center justify-center bg-gradient-to-br ${item.bg} mb-3`}>
                  <item.icon className={`w-5 h-5 ${item.text}`} />
                </div>
                <p className="font-semibold text-sm">{item.label}</p>
                <p className="text-xs text-muted-foreground mt-1 flex items-center gap-1">
                  Accéder <ArrowRight className="w-3 h-3" />
                </p>
              </CardContent>
            </Card>
          </Link>
        ))}
      </div>
    </div>
  );
}
