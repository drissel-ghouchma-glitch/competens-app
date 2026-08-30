import { useState } from "react";
import { useParams } from "react-router-dom";
import { useStudentDetail } from "@/hooks/use-student-detail";
import { useAuth } from "@/hooks/use-auth";
import { useI18n } from "@/i18n";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Progress } from "@/components/ui/progress";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  Calendar, User, GraduationCap, TrendingUp, Bell,
  CheckCircle, Clock, XCircle, Edit, Save, X, Loader2,
  BarChart2, Eye, CalendarCheck,
} from "lucide-react";
import {
  ResponsiveContainer, RadarChart, PolarGrid, PolarAngleAxis, PolarRadiusAxis, Radar,
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Cell,
} from "recharts";
import type { AcademicHistoryItem, CompetencyStat, TimelinePoint } from "@/hooks/use-student-detail";
import type { AttendanceRecord } from "@/types";
import { DailyGranularAnalytics } from "@/components/DailyGranularAnalytics";
import { SkillHistoryChart } from "@/components/SkillHistoryChart";
import { SkillRecoveryDialog } from "@/components/SkillRecoveryDialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { localizeCompTitle } from "@/i18n/competency-content";
import { cn } from "@/lib/utils";

// ── Helpers ──────────────────────────────────────────────────────────────────

function StatusIcon({ status }: { status: string }) {
  switch (status) {
    case "acquis": return <CheckCircle className="w-4 h-4 text-green-500" />;
    case "en_cours": return <Clock className="w-4 h-4 text-amber-500" />;
    default: return <XCircle className="w-4 h-4 text-red-500" />;
  }
}

function statusKey(status: string) {
  if (status === "acquis") return "status.acquis";
  if (status === "en_cours") return "status.en_cours";
  return "status.non_acquis";
}

function acquisitionColor(rate: number) {
  if (rate >= 70) return "hsl(122 39% 49% / 0.15)";
  if (rate >= 40) return "hsl(25 100% 62% / 0.15)";
  return "hsl(4 77% 55% / 0.15)";
}

// ── Timeline BarChart ─────────────────────────────────────────────────────────

function barColor(rate: number) {
  if (rate > 90) return "hsl(122 39% 49%)";
  if (rate >= 50) return "hsl(38 92% 50%)";
  return "hsl(4 77% 55%)";
}

function TimelineTooltip({ active, payload }: { active?: boolean; payload?: Array<{ payload: TimelinePoint }> }) {
  const { t, lang } = useI18n();
  if (!active || !payload?.length) return null;
  const d = payload[0].payload;
  const dateLabel = new Date(d.date + "T00:00:00").toLocaleDateString(lang === "ar" ? "ar-MA" : "fr-FR", { day: "numeric", month: "long", year: "numeric" });
  return (
    <div className="rounded-xl border bg-popover shadow-lg p-3 text-sm min-w-[160px]">
      <p className="font-semibold text-foreground mb-1">{dateLabel}</p>
      <p className="font-bold" style={{ color: barColor(d.rate) }}>{d.rate}%</p>
      <p className="text-xs text-muted-foreground mt-0.5">{t("studentDetail.evalUnit", { count: d.count })}</p>
      {d.teachers.length > 0 && (
        <div className="mt-2 pt-2 border-t border-border">
          <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wide mb-1">{t("studentDetail.teachersLabel")}</p>
          {d.teachers.map((teacher) => (
            <p key={teacher} className="text-xs text-foreground">{teacher}</p>
          ))}
        </div>
      )}
    </div>
  );
}

function TimelineChart({ timeline }: { timeline: TimelinePoint[] }) {
  const { t, lang } = useI18n();
  if (timeline.length === 0) {
    return (
      <Card className="border-border/50">
        <CardContent className="p-8 text-center text-muted-foreground text-sm">
          {t("studentDetail.timelineEmpty")}
        </CardContent>
      </Card>
    );
  }
  const data = timeline.map((p) => ({
    ...p,
    label: new Date(p.date + "T00:00:00").toLocaleDateString(lang === "ar" ? "ar-MA" : "fr-FR", { day: "2-digit", month: "2-digit" }),
  }));
  return (
    <Card className="border-border/50">
      <CardHeader className="pb-2">
        <CardTitle className="text-base font-semibold flex items-center gap-2">
          <BarChart2 className="w-4 h-4 text-primary" />
          {t("studentDetail.timelineTitle")}
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="h-[260px]">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={data} margin={{ top: 8, right: 8, left: -20, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
              <XAxis dataKey="label" tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }} />
              <YAxis domain={[0, 100]} tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }} unit="%" />
              <Tooltip content={<TimelineTooltip />} />
              <Bar dataKey="rate" radius={[4, 4, 0, 0]}>
                {data.map((entry, i) => (
                  <Cell key={i} fill={barColor(entry.rate)} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
        <div className="flex items-center gap-4 mt-3 text-xs text-muted-foreground justify-center flex-wrap">
          <span className="flex items-center gap-1.5"><span className="w-3 h-3 rounded-sm inline-block" style={{ background: "hsl(122 39% 49%)" }} /> {t("status.acquisLong")}</span>
          <span className="flex items-center gap-1.5"><span className="w-3 h-3 rounded-sm inline-block" style={{ background: "hsl(38 92% 50%)" }} /> {t("status.enCoursLong")}</span>
          <span className="flex items-center gap-1.5"><span className="w-3 h-3 rounded-sm inline-block" style={{ background: "hsl(4 77% 55%)" }} /> {t("status.nonAcquisLong")}</span>
        </div>
      </CardContent>
    </Card>
  );
}

// ── Stats panels (shared between roles) ──────────────────────────────────────

function RadarPanel({ stats, title, studentId, competencies, penalties, recoveries }: {
  stats: CompetencyStat[]; title?: string; studentId?: string; competencies?: import("@/types").Competency[];
  penalties?: import("@/components/DailyGranularAnalytics").DailyEvalRecord[];
  recoveries?: import("@/types").SkillRecoveryAction[];
}) {
  const { t } = useI18n();
  const data = stats.map((s) => ({ subject: s.competencyCode, value: s.acquisitionRate, fullMark: 100 }));
  if (data.length === 0) return (
    <Card className="border-border/50">
      <CardContent className="p-8 text-center text-muted-foreground text-sm">
        {t("studentDetail.noEvalAvailable")}
      </CardContent>
    </Card>
  );
  return (
    <Card className="border-border/50">
      <CardHeader className="pb-2">
        <CardTitle className="text-base font-semibold flex items-center gap-2">
          <TrendingUp className="w-4 h-4 text-primary" />
          {title ?? t("studentDetail.radarTitle")}
        </CardTitle>
      </CardHeader>
      <CardContent>
        {studentId && competencies && penalties && recoveries ? (
          <Tabs defaultValue="radar">
            <TabsList className="mb-3">
              <TabsTrigger value="radar">{t("skillHistory.radarTab")}</TabsTrigger>
              <TabsTrigger value="history">{t("skillHistory.historyTab")}</TabsTrigger>
            </TabsList>
            <TabsContent value="radar" className="mt-0">
              <div className="h-[300px] md:h-[360px]">
                <ResponsiveContainer width="100%" height="100%">
                  <RadarChart data={data} cx="50%" cy="50%" outerRadius="75%">
                    <PolarGrid stroke="hsl(var(--border))" />
                    <PolarAngleAxis dataKey="subject" tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }} />
                    <PolarRadiusAxis angle={30} domain={[0, 100]} tick={{ fontSize: 10 }} />
                    <Radar name="rate" dataKey="value" stroke="hsl(220 99% 62%)" fill="hsl(220 99% 62%)" fillOpacity={0.2} />
                  </RadarChart>
                </ResponsiveContainer>
              </div>
            </TabsContent>
            <TabsContent value="history" className="mt-0">
              <SkillHistoryChart studentId={studentId} competencies={competencies} penalties={penalties} recoveries={recoveries} />
            </TabsContent>
          </Tabs>
        ) : (
          <div className="h-[300px] md:h-[360px]">
            <ResponsiveContainer width="100%" height="100%">
              <RadarChart data={data} cx="50%" cy="50%" outerRadius="75%">
                <PolarGrid stroke="hsl(var(--border))" />
                <PolarAngleAxis dataKey="subject" tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }} />
                <PolarRadiusAxis angle={30} domain={[0, 100]} tick={{ fontSize: 10 }} />
                <Radar name="rate" dataKey="value" stroke="hsl(220 99% 62%)" fill="hsl(220 99% 62%)" fillOpacity={0.2} />
              </RadarChart>
            </ResponsiveContainer>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function SummaryPanel({ stats }: { stats: CompetencyStat[] }) {
  const { t } = useI18n();
  return (
    <Card className="border-border/50">
      <CardHeader className="pb-2">
        <CardTitle className="text-base font-semibold">{t("studentDetail.summary")}</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        {stats.length === 0 && <p className="text-sm text-muted-foreground">{t("studentDetail.noData")}</p>}
        {stats.map((s) => (
          <div key={s.competencyCode} className="space-y-1.5">
            <div className="flex items-center justify-between text-xs">
              <span className="font-medium text-foreground">{s.competencyCode}</span>
              <div className="flex items-center gap-1.5">
                <StatusIcon status={s.lastStatus} />
                <span className="text-muted-foreground">{s.acquisitionRate}%</span>
              </div>
            </div>
            <Progress value={s.acquisitionRate} className="h-1.5" />
          </div>
        ))}
      </CardContent>
    </Card>
  );
}

function SkillGrid({ stats }: { stats: CompetencyStat[] }) {
  const { t, lang } = useI18n();
  return (
    <Card className="border-border/50">
      <CardHeader className="pb-2">
        <CardTitle className="text-base font-semibold">{t("studentDetail.detailByComp")}</CardTitle>
      </CardHeader>
      <CardContent>
        {stats.length === 0 && (
          <p className="text-sm text-muted-foreground py-4 text-center">
            {t("studentDetail.noEvalRecorded")}
          </p>
        )}
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {stats.map((s) => (
            <div key={s.competencyCode} className={cn("flex items-start gap-3 p-3 rounded-xl bg-muted/40", s.isArchived && "opacity-60")}>
              <div className="w-10 h-10 rounded-lg flex items-center justify-center shrink-0"
                style={{ backgroundColor: acquisitionColor(s.acquisitionRate) }}>
                <StatusIcon status={s.lastStatus} />
              </div>
              <div className="min-w-0 flex-1">
                <p className="text-sm font-semibold text-foreground">{s.competencyCode}</p>
                <p className={cn("text-xs truncate", s.isArchived ? "text-muted-foreground/50 italic" : "text-muted-foreground")}>
                  {localizeCompTitle(s.competencyCode, s.competencyTitle, lang)}
                  {s.isArchived && <span className="ms-1">{t("competency.archivedLabel")}</span>}
                </p>
                <div className="flex items-center gap-2 mt-1.5">
                  <Progress value={s.acquisitionRate} className="h-1 flex-1" />
                  <span className="text-xs font-mono font-medium">{s.acquisitionRate}%</span>
                </div>
                <p className="text-[10px] text-muted-foreground mt-0.5">
                  {t("studentDetail.evalCount", { count: s.totalEvaluations, status: t(statusKey(s.lastStatus)) })}
                </p>
              </div>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}

// ── Attendance History ────────────────────────────────────────────────────────

function AttendanceHistoryCard({ history }: { history: AttendanceRecord[] }) {
  const { t, lang } = useI18n();
  if (history.length === 0) return null;
  const absences = history.filter((r) => r.status === "absent");
  return (
    <Card className="border-border/50">
      <CardHeader className="pb-2">
        <CardTitle className="text-base font-semibold flex items-center gap-2">
          <CalendarCheck className="w-4 h-4 text-primary" />
          {t("studentDetail.attendanceHistory")}
          {absences.length > 0 && (
            <Badge className="ms-1 bg-red-500/10 text-red-600 border-red-500/20 text-xs">
              {t("studentDetail.absencesBadge", { count: absences.length })}
            </Badge>
          )}
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="divide-y divide-border">
          {history.slice(0, 30).map((r) => {
            const isPresent = r.status === "present";
            const dateLabel = new Date(r.date + "T00:00:00").toLocaleDateString(lang === "ar" ? "ar-MA" : "fr-FR", { weekday: "short", day: "numeric", month: "long", year: "numeric" });
            return (
              <div key={r.id} className="flex items-center justify-between py-2.5">
                <span className="text-sm text-muted-foreground">{dateLabel}</span>
                <Badge
                  className={isPresent
                    ? "bg-green-500/10 text-green-700 border-green-500/20"
                    : "bg-red-500/10 text-red-700 border-red-500/20"}
                >
                  {isPresent
                    ? <><CheckCircle className="w-3 h-3 me-1 inline" />{t("studentDetail.present")}</>
                    : <><XCircle className="w-3 h-3 me-1 inline" />{t("studentDetail.absent")}</>}
                </Badge>
              </div>
            );
          })}
        </div>
        {history.length > 30 && (
          <p className="text-xs text-muted-foreground mt-3 text-center">
            {t("studentDetail.attendanceShown", { count: history.length })}
          </p>
        )}
      </CardContent>
    </Card>
  );
}

function AcademicHistoryCard({ history }: { history: AcademicHistoryItem[] }) {
  const { t } = useI18n();
  if (history.length === 0) return null;
  return (
    <Card className="border-border/50">
      <CardHeader className="pb-2">
        <CardTitle className="text-base font-semibold flex items-center gap-2">
          <GraduationCap className="w-4 h-4 text-primary" />
          {t("studentDetail.academicHistory")}
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-2">
        {history.map((item) => (
          <div key={item.id} className="flex flex-col gap-2 rounded-lg border p-3 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <p className="font-medium">{item.schoolYearName}</p>
              <p className="text-sm text-muted-foreground">
                {item.className}{item.levelCode ? ` · ${item.levelCode}` : ""}
              </p>
            </div>
            <Badge variant={item.status === "active" ? "default" : "secondary"}>
              {t(`studentDetail.enrollment.${item.status}`)}
            </Badge>
          </div>
        ))}
      </CardContent>
    </Card>
  );
}

// ── Main Page ─────────────────────────────────────────────────────────────────

export default function StudentDetailPage() {
  const { id } = useParams<{ id: string }>();
  const { user } = useAuth();
  const { t } = useI18n();
  const role = user?.role ?? "admin";

  const {
    student, classe, level, competencies,
    myStats, globalStats, alerts, timeline, attendanceHistory, classes,
    rawEvals, recoveryActions, classTeachers, academicHistory,
    loading, error, updateStudent, createRecoveryAction,
  } = useStudentDetail(id);

  // Admin edit state
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [editFirstName, setEditFirstName] = useState("");
  const [editLastName, setEditLastName] = useState("");
  const [editBirthDate, setEditBirthDate] = useState("");
  const [editGender, setEditGender] = useState<"M" | "F">("M");
  const [editClassId, setEditClassId] = useState("");

  // Admin analytics toggle
  const [showGlobal, setShowGlobal] = useState(false);
  const [recoveryOpen, setRecoveryOpen] = useState(false);

  const pendingAlerts = alerts.filter((a) => !a.resolved).length;
  const isPrincipalTeacher = role === "professeur" && classe?.teacherId === user?.id;
  const canRecover = role === "admin" || role === "directeur" || isPrincipalTeacher;
  const displayStats = (role !== "professeur" && showGlobal) ? globalStats : myStats;

  const startEdit = () => {
    if (!student) return;
    setEditFirstName(student.firstName);
    setEditLastName(student.lastName);
    setEditBirthDate(student.birthDate);
    setEditGender(student.gender);
    setEditClassId(student.classId);
    setSaveError(null);
    setEditing(true);
  };

  const cancelEdit = () => { setEditing(false); setSaveError(null); };

  const saveEdit = async () => {
    setSaving(true);
    setSaveError(null);
    try {
      await updateStudent({
        firstName: editFirstName,
        lastName: editLastName,
        birthDate: editBirthDate,
        gender: editGender,
        classId: editClassId,
      });
      setEditing(false);
    } catch (e: unknown) {
      setSaveError(e instanceof Error ? e.message : t("common.saveError"));
    } finally {
      setSaving(false);
    }
  };

  // ── Loading / Error ───────────────────────────────────────

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="rounded-lg border border-destructive/30 bg-destructive/5 p-4 text-sm text-destructive">
        {error}
      </div>
    );
  }

  if (!student) {
    return (
      <div className="text-center py-16 text-muted-foreground text-sm">
        {t("studentDetail.notFound")}
      </div>
    );
  }

  const age = Math.floor(
    (Date.now() - new Date(student.birthDate).getTime()) / (365.25 * 24 * 60 * 60 * 1000)
  );

  // ═════════════════════════════════════════════════════════
  // TEACHER VIEW — read-only, only their own evaluations
  // ═════════════════════════════════════════════════════════
  if (role === "professeur" || role === "parent") {
    const readOnlyStats = role === "parent" ? globalStats : myStats;
    return (
      <div className="space-y-6 animate-in fade-in duration-500">
        {/* Header */}
        <div className="flex flex-col sm:flex-row gap-4">
          <div className="w-16 h-16 sm:w-20 sm:h-20 rounded-2xl bg-primary/10 flex items-center justify-center text-primary font-bold text-2xl shrink-0">
            {student.firstName[0]}{student.lastName[0]}
          </div>
          <div className="flex-1">
            <h1 className="text-2xl font-bold tracking-tight">{student.firstName} {student.lastName}</h1>
            <div className="flex flex-wrap items-center gap-3 mt-2 text-sm text-muted-foreground">
              <span className="flex items-center gap-1"><GraduationCap className="w-4 h-4" />{classe?.name ?? "—"}</span>
              <span className="flex items-center gap-1"><User className="w-4 h-4" />{student.gender === "M" ? t("studentDetail.boy") : t("studentDetail.girl")}</span>
              {student.birthDate && <span className="flex items-center gap-1"><Calendar className="w-4 h-4" />{t("studentDetail.years", { count: age })}</span>}
              {level && <Badge variant="secondary">{level.code}</Badge>}
              {pendingAlerts > 0 && <Badge className="bg-destructive/10 text-destructive border-destructive/20">{t("studentDetail.alerts", { count: pendingAlerts })}</Badge>}
            </div>
            <p className="mt-2 text-xs text-muted-foreground italic flex items-center gap-1">
              <Eye className="w-3.5 h-3.5" /> {role === "parent" ? t("studentDetail.parentViewNote") : t("studentDetail.teacherViewNote")}
            </p>
          </div>
        </div>

        {/* Active alerts */}
        {alerts.filter((a) => !a.resolved).map((a) => (
          <Card key={a.id} className={`border-s-4 ${a.level === "critical" ? "border-s-destructive" : "border-s-amber-400"}`}>
            <CardContent className="p-4 flex items-start gap-3">
              <Bell className={`w-5 h-5 mt-0.5 shrink-0 ${a.level === "critical" ? "text-destructive" : "text-amber-500"}`} />
              <div>
                <p className="font-medium text-foreground">{a.level === "critical" ? t("studentDetail.criticalAlert") : t("studentDetail.lightAlert")}</p>
                <p className="text-sm text-muted-foreground">{a.cause}</p>
              </div>
            </CardContent>
          </Card>
        ))}

        {/* Stats */}
        <div className="grid lg:grid-cols-3 gap-4 md:gap-6">
          <div className="lg:col-span-2">
            <RadarPanel stats={readOnlyStats} title={role === "parent" ? t("studentDetail.radarGlobal") : t("studentDetail.myRadar")} studentId={student.id} competencies={competencies} penalties={rawEvals} recoveries={recoveryActions} />
          </div>
          <SummaryPanel stats={readOnlyStats} />
        </div>
        <SkillGrid stats={readOnlyStats} />
        {role === "parent" && <AcademicHistoryCard history={academicHistory} />}
        {canRecover && (
          <div className="flex justify-end">
            <Button onClick={() => setRecoveryOpen(true)} className="gap-2"><TrendingUp className="h-4 w-4" />{t("skillRecovery.open")}</Button>
          </div>
        )}
        <SkillRecoveryDialog open={recoveryOpen} onOpenChange={setRecoveryOpen} studentName={`${student.firstName} ${student.lastName}`} competencies={competencies} skills={globalStats} onSubmit={createRecoveryAction} />
      </div>
    );
  }

  // ═════════════════════════════════════════════════════════
  // ADMIN / DIRECTEUR VIEW — full edit + global analytics
  // ═════════════════════════════════════════════════════════
  return (
    <div className="space-y-6 animate-in fade-in duration-500">

      {/* Header with edit controls */}
      <div className="flex flex-col sm:flex-row gap-4">
        <div className="w-16 h-16 sm:w-20 sm:h-20 rounded-2xl bg-primary/10 flex items-center justify-center text-primary font-bold text-2xl shrink-0">
          {student.firstName[0]}{student.lastName[0]}
        </div>
        <div className="flex-1 min-w-0">
          {editing ? (
            <div className="space-y-3">
              <div className="grid grid-cols-2 gap-2">
                <div className="space-y-1">
                  <Label className="text-xs">{t("studentDetail.firstName")}</Label>
                  <Input value={editFirstName} onChange={(e) => setEditFirstName(e.target.value)} className="h-8" />
                </div>
                <div className="space-y-1">
                  <Label className="text-xs">{t("studentDetail.lastName")}</Label>
                  <Input value={editLastName} onChange={(e) => setEditLastName(e.target.value)} className="h-8" />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div className="space-y-1">
                  <Label className="text-xs">{t("studentDetail.birthDate")}</Label>
                  <Input type="date" value={editBirthDate} onChange={(e) => setEditBirthDate(e.target.value)} className="h-8" />
                </div>
                <div className="space-y-1">
                  <Label className="text-xs">{t("studentDetail.gender")}</Label>
                  <Select value={editGender} onValueChange={(v) => setEditGender(v as "M" | "F")}>
                    <SelectTrigger className="h-8"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="M">{t("studentDetail.boy")}</SelectItem>
                      <SelectItem value="F">{t("studentDetail.girl")}</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <div className="space-y-1">
                <Label className="text-xs">{t("studentDetail.class")}</Label>
                <Select value={editClassId} onValueChange={setEditClassId}>
                  <SelectTrigger className="h-8"><SelectValue placeholder={t("studentDetail.chooseClass")} /></SelectTrigger>
                  <SelectContent>
                    {classes.map((c) => (
                      <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              {saveError && <p className="text-xs text-destructive">{saveError}</p>}
              <div className="flex gap-2">
                <Button size="sm" onClick={saveEdit} disabled={saving} className="gap-1.5">
                  {saving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Save className="w-3.5 h-3.5" />}
                  {t("common.save")}
                </Button>
                <Button size="sm" variant="outline" onClick={cancelEdit} disabled={saving} className="gap-1.5">
                  <X className="w-3.5 h-3.5" /> {t("common.cancel")}
                </Button>
              </div>
            </div>
          ) : (
            <>
              <div className="flex items-start justify-between gap-3">
                <div>
                  <h1 className="text-2xl font-bold tracking-tight">{student.firstName} {student.lastName}</h1>
                  <div className="flex flex-wrap items-center gap-3 mt-2 text-sm text-muted-foreground">
                    <span className="flex items-center gap-1"><GraduationCap className="w-4 h-4" />{classe?.name ?? "—"}</span>
                    <span className="flex items-center gap-1"><User className="w-4 h-4" />{student.gender === "M" ? t("studentDetail.boy") : t("studentDetail.girl")}</span>
                    {student.birthDate && <span className="flex items-center gap-1"><Calendar className="w-4 h-4" />{t("studentDetail.years", { count: age })}</span>}
                    {level && <Badge variant="secondary">{level.code}</Badge>}
                    {pendingAlerts > 0 && <Badge className="bg-destructive/10 text-destructive border-destructive/20">{t("studentDetail.alerts", { count: pendingAlerts })}</Badge>}
                  </div>
                </div>
                <div className="flex gap-2 shrink-0">
                  {canRecover && <Button size="sm" onClick={() => setRecoveryOpen(true)} className="gap-1.5"><TrendingUp className="w-3.5 h-3.5" /> {t("skillRecovery.open")}</Button>}
                  <Button size="sm" variant="outline" onClick={startEdit} className="gap-1.5">
                    <Edit className="w-3.5 h-3.5" /> {t("studentDetail.edit")}
                  </Button>
                </div>
              </div>
            </>
          )}
        </div>
      </div>

      {/* Active alerts */}
      {alerts.filter((a) => !a.resolved).map((a) => (
        <Card key={a.id} className={`border-s-4 ${a.level === "critical" ? "border-s-destructive" : "border-s-amber-400"}`}>
          <CardContent className="p-4 flex items-start gap-3">
            <Bell className={`w-5 h-5 mt-0.5 shrink-0 ${a.level === "critical" ? "text-destructive" : "text-amber-500"}`} />
            <div>
              <p className="font-medium text-foreground">{a.level === "critical" ? t("studentDetail.criticalAlert") : t("studentDetail.lightAlert")}</p>
              <p className="text-sm text-muted-foreground">{a.cause}</p>
            </div>
          </CardContent>
        </Card>
      ))}

      {/* Analytics toggle */}
      <div className="flex items-center gap-2">
        <Button
          size="sm"
          variant={!showGlobal ? "default" : "outline"}
          onClick={() => setShowGlobal(false)}
          className="gap-1.5"
        >
          <Eye className="w-3.5 h-3.5" /> {t("studentDetail.globalView")}
        </Button>
        <Button
          size="sm"
          variant={showGlobal ? "default" : "outline"}
          onClick={() => setShowGlobal(true)}
          className="gap-1.5"
        >
          <BarChart2 className="w-3.5 h-3.5" /> {t("studentDetail.globalAnalysis")}
        </Button>
      </div>

      {showGlobal && (
        <Card className="border-primary/20 bg-primary/5">
          <CardContent className="p-3 text-xs text-primary flex items-center gap-2">
            <BarChart2 className="w-3.5 h-3.5 shrink-0" />
            {t("studentDetail.globalBanner")}
          </CardContent>
        </Card>
      )}

      {/* Charts */}
      <div className="grid lg:grid-cols-3 gap-4 md:gap-6">
        <div className="lg:col-span-2">
          <RadarPanel
            stats={displayStats}
            title={showGlobal ? t("studentDetail.radarGlobal") : t("studentDetail.radarDefault")}
            studentId={student.id}
            competencies={competencies}
            penalties={rawEvals}
            recoveries={recoveryActions}
          />
        </div>
        <SummaryPanel stats={displayStats} />
      </div>

      <SkillGrid stats={displayStats} />

      <TimelineChart timeline={timeline} />

      {id && (
        <DailyGranularAnalytics
          studentId={id}
          rawEvals={rawEvals}
          competencies={competencies}
          classTeachers={classTeachers}
          recoveryActions={recoveryActions}
        />
      )}

      <AttendanceHistoryCard history={attendanceHistory} />
      <AcademicHistoryCard history={academicHistory} />
      <SkillRecoveryDialog open={recoveryOpen} onOpenChange={setRecoveryOpen} studentName={`${student.firstName} ${student.lastName}`} competencies={competencies} skills={globalStats} onSubmit={createRecoveryAction} />
    </div>
  );
}
