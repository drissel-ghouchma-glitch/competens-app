import { useState } from "react";
import { useParent, type ParentChild } from "@/hooks/use-parent";
import { useCelebrationSettings } from "@/hooks/use-celebration-settings";
import { useI18n } from "@/i18n";
import { HonorRoll } from "@/components/HonorRoll";
import type { Competency, AttendanceStatus } from "@/types";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  User, Calendar, Bell, TrendingUp,
  CheckCircle, Clock, XCircle, Loader2, Users, CalendarCheck,
} from "lucide-react";
import {
  ResponsiveContainer, RadarChart, PolarGrid, PolarAngleAxis, PolarRadiusAxis, Radar,
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Cell,
} from "recharts";
import type { TimelinePoint } from "@/hooks/use-parent";
import { DailyGranularAnalytics } from "@/components/DailyGranularAnalytics";
import { SkillHistoryChart } from "@/components/SkillHistoryChart";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { localizeCompTitle } from "@/i18n/competency-content";
import { cn } from "@/lib/utils";

// ── Helpers ────────────────────────────────────────────────────

function StatusIcon({ status }: { status: string }) {
  switch (status) {
    case "acquis":    return <CheckCircle className="w-4 h-4 text-green-500" />;
    case "en_cours":  return <Clock       className="w-4 h-4 text-amber-500" />;
    default:          return <XCircle     className="w-4 h-4 text-red-500"   />;
  }
}

function statusKey(s: string) {
  if (s === "acquis") return "status.acquis";
  if (s === "en_cours") return "status.en_cours";
  return "status.non_acquis";
}

function acqColor(rate: number) {
  if (rate >= 70) return "hsl(122 39% 49% / 0.15)";
  if (rate >= 40) return "hsl(25 100% 62% / 0.15)";
  return "hsl(4 77% 55% / 0.15)";
}

// ── Timeline BarChart (shared helper) ─────────────────────────

function barColor(rate: number) {
  if (rate > 90) return "hsl(122 39% 49%)";
  if (rate >= 50) return "hsl(38 92% 50%)";
  return "hsl(4 77% 55%)";
}

function TimelineTooltipContent({ active, payload }: { active?: boolean; payload?: Array<{ payload: TimelinePoint }> }) {
  const { t, lang } = useI18n();
  if (!active || !payload?.length) return null;
  const d = payload[0].payload;
  const dateLabel = new Date(d.date + "T00:00:00").toLocaleDateString(lang === "ar" ? "ar-MA" : "fr-FR", { day: "numeric", month: "long", year: "numeric" });
  return (
    <div className="rounded-xl border bg-popover shadow-lg p-3 text-sm min-w-[160px]">
      <p className="font-semibold text-foreground mb-1">{dateLabel}</p>
      <p className="font-bold" style={{ color: barColor(d.rate) }}>{d.rate}%</p>
      <p className="text-xs text-muted-foreground mt-0.5">{t("parent.evalUnit", { count: d.count })}</p>
      {d.teachers.length > 0 && (
        <div className="mt-2 pt-2 border-t border-border">
          <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wide mb-1">{t("parent.teachersLabel")}</p>
          {d.teachers.map((teacher) => <p key={teacher} className="text-xs text-foreground">{teacher}</p>)}
        </div>
      )}
    </div>
  );
}

function TimelineChart({ timeline }: { timeline: TimelinePoint[] }) {
  const { t, lang } = useI18n();
  if (timeline.length === 0) return null;
  const data = timeline.map((p) => ({
    ...p,
    label: new Date(p.date + "T00:00:00").toLocaleDateString(lang === "ar" ? "ar-MA" : "fr-FR", { day: "2-digit", month: "2-digit" }),
  }));
  return (
    <Card className="border-border/50">
      <CardHeader className="pb-2">
        <CardTitle className="text-base font-semibold flex items-center gap-2">
          <TrendingUp className="w-4 h-4 text-primary" />
          {t("parent.timelineTitle")}
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="h-[220px]">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={data} margin={{ top: 8, right: 8, left: -20, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
              <XAxis dataKey="label" tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }} />
              <YAxis domain={[0, 100]} tick={{ fontSize: 11 }} unit="%" />
              <Tooltip content={<TimelineTooltipContent />} />
              <Bar dataKey="rate" radius={[4, 4, 0, 0]}>
                {data.map((entry, i) => (
                  <Cell key={i} fill={barColor(entry.rate)} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
        <div className="flex items-center gap-4 mt-3 text-xs text-muted-foreground justify-center flex-wrap">
          <span className="flex items-center gap-1.5"><span className="w-3 h-3 rounded-sm inline-block" style={{ background: "hsl(122 39% 49%)" }} /> {t("status.acquis")}</span>
          <span className="flex items-center gap-1.5"><span className="w-3 h-3 rounded-sm inline-block" style={{ background: "hsl(38 92% 50%)" }} /> {t("status.en_cours")}</span>
          <span className="flex items-center gap-1.5"><span className="w-3 h-3 rounded-sm inline-block" style={{ background: "hsl(4 77% 55%)" }} /> {t("status.non_acquis")}</span>
        </div>
      </CardContent>
    </Card>
  );
}

// ── Attendance section ─────────────────────────────────────────

function AttendanceSummary({ todayMorning, todayAfternoon, absenceHistory }: {
  todayMorning: AttendanceStatus | null;
  todayAfternoon: AttendanceStatus | null;
  absenceHistory: string[];
}) {
  const { t, lang } = useI18n();
  const locale = lang === "ar" ? "ar-MA" : "fr-FR";

  function PeriodRow({ label, status }: { label: string; status: AttendanceStatus | null }) {
    const isPresent  = status === "present";
    const isAbsent   = status === "absent";
    return (
      <div className={`flex items-center gap-3 px-4 py-3 rounded-xl border ${
        isPresent ? "bg-green-500/8 border-green-500/25" :
        isAbsent  ? "bg-red-500/8 border-red-500/25" :
                    "bg-muted/30 border-border"
      }`}>
        {isPresent && <CheckCircle className="w-5 h-5 text-green-500 shrink-0" />}
        {isAbsent  && <XCircle     className="w-5 h-5 text-red-500   shrink-0" />}
        {!status   && <Clock       className="w-5 h-5 text-muted-foreground shrink-0" />}
        <div className="flex-1 min-w-0">
          <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">{label}</p>
          <p className={`font-semibold text-sm ${
            isPresent ? "text-green-700 dark:text-green-400" :
            isAbsent  ? "text-red-700 dark:text-red-400" :
                        "text-muted-foreground"
          }`}>
            {isPresent ? t("parent.present") : isAbsent ? t("parent.absent") : t("parent.notRecordedPeriod")}
          </p>
        </div>
      </div>
    );
  }

  return (
    <Card className="border-border/50">
      <CardHeader className="pb-2">
        <CardTitle className="text-base font-semibold flex items-center gap-2">
          <CalendarCheck className="w-4 h-4 text-primary" />
          {t("parent.attendanceToday")}
          <span className="text-xs text-muted-foreground font-normal ms-1">
            {new Date().toLocaleDateString(locale, { weekday: "long", day: "numeric", month: "long" })}
          </span>
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid grid-cols-2 gap-2">
          <PeriodRow label={t("parent.attendanceMorning")} status={todayMorning} />
          <PeriodRow label={t("parent.attendanceAfternoon")} status={todayAfternoon} />
        </div>

        {absenceHistory.length > 0 && (
          <div>
            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2">
              {t("parent.recentAbsences", { count: absenceHistory.length })}
            </p>
            <div className="space-y-1.5 max-h-40 overflow-y-auto pe-1">
              {absenceHistory.slice(0, 15).map((date) => (
                <div key={date} className="flex items-center gap-2 text-sm">
                  <XCircle className="w-3.5 h-3.5 text-red-500 shrink-0" />
                  <span className="text-muted-foreground">
                    {new Date(date + "T00:00:00").toLocaleDateString(locale, { weekday: "short", day: "numeric", month: "long", year: "numeric" })}
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}
        {absenceHistory.length === 0 && (todayMorning !== null || todayAfternoon !== null) && (
          <p className="text-xs text-muted-foreground text-center py-1">{t("parent.noAbsence")}</p>
        )}
      </CardContent>
    </Card>
  );
}

// ── Child Analytics (read-only) ────────────────────────────────

function ChildAnalytics({ child, competencies }: { child: ParentChild; competencies: Competency[] }) {
  const { t, lang } = useI18n();
  const radarData = child.stats.map((s) => ({
    subject: s.competencyCode, value: s.acquisitionRate, fullMark: 100,
  }));

  const acquired  = child.stats.filter((s) => s.lastStatus === "acquis").length;
  const inProgress = child.stats.filter((s) => s.lastStatus === "en_cours").length;
  const notAcq    = child.stats.filter((s) => s.lastStatus === "non_acquis").length;
  const globalRate = child.stats.length > 0
    ? Math.round(child.stats.reduce((sum, s) => sum + s.acquisitionRate, 0) / child.stats.length)
    : 0;

  return (
    <div className="space-y-6">
      {/* Alerts */}
      {child.alerts.length > 0 && (
        <div className="space-y-2">
          {child.alerts.map((a) => (
            <Card key={a.id} className={`border-s-4 ${a.level === "critical" ? "border-s-destructive" : "border-s-amber-400"}`}>
              <CardContent className="p-4 flex items-start gap-3">
                <Bell className={`w-5 h-5 mt-0.5 shrink-0 ${a.level === "critical" ? "text-destructive" : "text-amber-500"}`} />
                <div>
                  <p className="font-medium text-foreground text-sm">{a.level === "critical" ? t("parent.criticalAlert") : t("parent.alert")}</p>
                  <p className="text-xs text-muted-foreground">{a.cause}</p>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* Summary cards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {[
          { label: t("parent.globalRate"),   value: `${globalRate}%`,  color: "text-primary",        bg: "bg-primary/10" },
          { label: t("parent.acquired"),     value: acquired,           color: "text-green-600",       bg: "bg-green-500/10" },
          { label: t("parent.inProgress"),   value: inProgress,         color: "text-amber-600",       bg: "bg-amber-500/10" },
          { label: t("parent.notAcquired"),  value: notAcq,             color: "text-red-600",         bg: "bg-red-500/10" },
        ].map((c) => (
          <Card key={c.label} className="border-border/50">
            <CardContent className="p-4 text-center">
              <div className={`w-10 h-10 rounded-xl ${c.bg} flex items-center justify-center mx-auto mb-2`}>
                <TrendingUp className={`w-5 h-5 ${c.color}`} />
              </div>
              <p className={`text-xl font-bold ${c.color}`}>{c.value}</p>
              <p className="text-xs text-muted-foreground mt-0.5">{c.label}</p>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Radar + summary */}
      {child.stats.length > 0 ? (
        <div className="grid lg:grid-cols-3 gap-4">
          <Card className="lg:col-span-2 border-border/50">
            <CardHeader className="pb-2">
              <CardTitle className="text-base font-semibold flex items-center gap-2">
                <TrendingUp className="w-4 h-4 text-primary" /> {t("parent.radarTitle")}
              </CardTitle>
            </CardHeader>
            <CardContent>
              <Tabs defaultValue="radar">
                <TabsList className="mb-3">
                  <TabsTrigger value="radar">{t("skillHistory.radarTab")}</TabsTrigger>
                  <TabsTrigger value="history">{t("skillHistory.historyTab")}</TabsTrigger>
                </TabsList>
                <TabsContent value="radar" className="mt-0">
                  <div className="h-[280px] md:h-[320px]">
                    <ResponsiveContainer width="100%" height="100%">
                      <RadarChart data={radarData} cx="50%" cy="50%" outerRadius="72%">
                        <PolarGrid stroke="hsl(var(--border))" />
                        <PolarAngleAxis dataKey="subject" tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }} />
                        <PolarRadiusAxis angle={30} domain={[0, 100]} tick={{ fontSize: 10 }} />
                        <Radar name="rate" dataKey="value" stroke="hsl(220 99% 62%)" fill="hsl(220 99% 62%)" fillOpacity={0.2} />
                      </RadarChart>
                    </ResponsiveContainer>
                  </div>
                </TabsContent>
                <TabsContent value="history" className="mt-0">
                  <SkillHistoryChart studentId={child.id} competencies={competencies} penalties={child.rawEvals} recoveries={child.recoveryActions} />
                </TabsContent>
              </Tabs>
            </CardContent>
          </Card>

          <Card className="border-border/50">
            <CardHeader className="pb-2">
              <CardTitle className="text-base font-semibold">{t("parent.summary")}</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              {child.stats.map((s) => (
                <div key={s.competencyCode} className="space-y-1">
                  <div className="flex items-center justify-between text-xs">
                    <span className="font-medium">{s.competencyCode}</span>
                    <div className="flex items-center gap-1"><StatusIcon status={s.lastStatus} /><span className="text-muted-foreground">{s.acquisitionRate}%</span></div>
                  </div>
                  <Progress value={s.acquisitionRate} className="h-1.5" />
                </div>
              ))}
            </CardContent>
          </Card>
        </div>
      ) : (
        <Card className="border-dashed border-2">
          <CardContent className="p-10 text-center text-muted-foreground text-sm">
            {t("parent.noEvalYet")}
          </CardContent>
        </Card>
      )}

      {/* Skill grid */}
      {child.stats.length > 0 && (
        <Card className="border-border/50">
          <CardHeader className="pb-2">
            <CardTitle className="text-base font-semibold">{t("parent.detailByComp")}</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3">
              {child.stats.map((s) => (
                <div key={s.competencyCode} className={cn("flex items-start gap-3 p-3 rounded-xl bg-muted/40", s.isArchived && "opacity-60")}>
                  <div className="w-10 h-10 rounded-lg flex items-center justify-center shrink-0"
                    style={{ backgroundColor: acqColor(s.acquisitionRate) }}>
                    <StatusIcon status={s.lastStatus} />
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-semibold">{s.competencyCode}</p>
                    <p className={cn("text-xs truncate", s.isArchived ? "text-muted-foreground/50 italic" : "text-muted-foreground")}>
                      {localizeCompTitle(s.competencyCode, s.competencyTitle, lang)}
                      {s.isArchived && <span className="ms-1">{t("competency.archivedLabel")}</span>}
                    </p>
                    <div className="flex items-center gap-2 mt-1.5">
                      <Progress value={s.acquisitionRate} className="h-1 flex-1" />
                      <span className="text-xs font-mono">{s.acquisitionRate}%</span>
                    </div>
                    <p className="text-[10px] text-muted-foreground mt-0.5">
                      {t("parent.evalCount", { count: s.totalEvaluations, status: t(statusKey(s.lastStatus)) })}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Timeline */}
      <TimelineChart timeline={child.timeline} />

      {/* Daily granular analytics */}
      <DailyGranularAnalytics
        studentId={child.id}
        rawEvals={child.rawEvals}
        competencies={competencies}
        classTeachers={child.classTeachers}
        recoveryActions={child.recoveryActions}
      />

      {/* Attendance */}
      <AttendanceSummary
        todayMorning={child.todayMorning}
        todayAfternoon={child.todayAfternoon}
        absenceHistory={child.absenceHistory}
      />
    </div>
  );
}

// ── Main Page ──────────────────────────────────────────────────

export default function ParentDashboard() {
  const { children, competencies, loading, error } = useParent();
  const { isPublished } = useCelebrationSettings();
  const { t } = useI18n();
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const selected = selectedId
    ? children.find((c) => c.id === selectedId) ?? children[0]
    : children[0];

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="rounded-lg border border-destructive/30 bg-destructive/5 p-4 text-sm text-destructive">{error}</div>
    );
  }

  if (children.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center h-64 gap-3 text-muted-foreground">
        <Users className="w-12 h-12" />
        <p className="font-medium">{t("parent.noChildTitle")}</p>
        <p className="text-sm text-center max-w-xs">
          {t("parent.noChildBody")}
        </p>
      </div>
    );
  }

  const age = selected
    ? Math.floor((Date.now() - new Date(selected.birthDate).getTime()) / (365.25 * 24 * 60 * 60 * 1000))
    : 0;

  return (
    <div className="space-y-6 animate-in fade-in duration-500">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">{t("parent.headerTitle")}</h1>
          <p className="text-sm text-muted-foreground">{t("parent.headerSubtitle")}</p>
        </div>
      </div>

      {/* Célébration de réussite — only visible once the admin publishes it */}
      {isPublished && <HonorRoll isAdmin={false} />}

      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">

        {/* Child selector — only if more than one child */}
        {children.length > 1 && (
          <Select value={selected?.id ?? ""} onValueChange={setSelectedId}>
            <SelectTrigger className="w-56">
              <SelectValue placeholder={t("parent.chooseChild")} />
            </SelectTrigger>
            <SelectContent>
              {children.map((c) => (
                <SelectItem key={c.id} value={c.id}>
                  {c.firstName} {c.lastName}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}
      </div>

      {/* Child tabs (visual) — when multiple children */}
      {children.length > 1 && (
        <div className="flex gap-2 flex-wrap">
          {children.map((c) => (
            <button
              key={c.id}
              onClick={() => setSelectedId(c.id)}
              className={`flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-medium transition-all border ${
                selected?.id === c.id
                  ? "bg-primary text-primary-foreground border-primary shadow-sm"
                  : "bg-card border-border text-muted-foreground hover:text-foreground hover:border-primary/40"
              }`}
            >
              <span className="w-7 h-7 rounded-full bg-current/10 flex items-center justify-center text-xs font-bold shrink-0">
                {c.firstName[0]}{c.lastName[0]}
              </span>
              {c.firstName}
              {c.alerts.length > 0 && (
                <Badge className="bg-destructive/10 text-destructive border-destructive/20 text-[10px] px-1.5 py-0">
                  {c.alerts.length}
                </Badge>
              )}
            </button>
          ))}
        </div>
      )}

      {/* Selected child header */}
      {selected && (
        <>
          <div className="flex items-center gap-4">
            <div className="w-14 h-14 rounded-2xl bg-primary/10 flex items-center justify-center text-primary font-bold text-xl shrink-0">
              {selected.firstName[0]}{selected.lastName[0]}
            </div>
            <div>
              <h2 className="text-xl font-bold">{selected.firstName} {selected.lastName}</h2>
              <div className="flex flex-wrap items-center gap-3 mt-1 text-sm text-muted-foreground">
                <span className="flex items-center gap-1"><User className="w-3.5 h-3.5" />{selected.gender === "M" ? t("parent.boy") : t("parent.girl")}</span>
                {selected.birthDate && <span className="flex items-center gap-1"><Calendar className="w-3.5 h-3.5" />{t("parent.years", { count: age })}</span>}
                {selected.alerts.length > 0 && (
                  <Badge className="bg-destructive/10 text-destructive border-destructive/20">
                    {t("parent.activeAlerts", { count: selected.alerts.length })}
                  </Badge>
                )}
              </div>
            </div>
          </div>

          <ChildAnalytics child={selected} competencies={competencies} />
        </>
      )}
    </div>
  );
}
