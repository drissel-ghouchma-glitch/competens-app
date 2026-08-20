import { useState, useMemo } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { BarChart2, ChevronLeft, Users } from "lucide-react";
import {
  ResponsiveContainer, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Cell,
} from "recharts";
import { useI18n } from "@/i18n";
import { localizeCompTitle } from "@/i18n/competency-content";
import { competencyScoreFromLedger } from "@/lib/eval-utils";
import type { Competency, SkillRecoveryAction } from "@/types";

// ── Shared types (exported for hook consumers) ─────────────────────────────────

export interface DailyEvalRecord {
  studentId: string;
  competencyId: string;
  teacherId: string;
  teacherName: string;
  date: string;
}

export interface ClassTeacher {
  id: string;
  name: string;
}

// ── Internal helpers ───────────────────────────────────────────────────────────

function barColor(rate: number) {
  if (rate > 90) return "hsl(122 39% 49%)";
  if (rate >= 50) return "hsl(38 92% 50%)";
  return "hsl(4 77% 55%)";
}

// ── Level-1 Tooltip ────────────────────────────────────────────────────────────

interface ChartEntry {
  id: string;
  code: string;
  title: string;
  rate: number;
  penaltyCount: number;       // penalties on selected day
  teacherNames: string[];     // teachers who penalized on selected day
}

function DayCompTooltip({
  active, payload,
}: {
  active?: boolean;
  payload?: Array<{ payload: ChartEntry }>;
}) {
  const { t } = useI18n();
  if (!active || !payload?.length) return null;
  const d = payload[0].payload;
  return (
    <div className="rounded-xl border bg-popover shadow-lg p-3 text-sm min-w-[190px]">
      <p className="font-semibold text-foreground mb-1 text-xs truncate">{d.code} — {d.title}</p>
      <p className="font-bold mb-1" style={{ color: barColor(d.rate) }}>{d.rate}/100</p>
      <p className="text-xs text-muted-foreground mb-2">
        {d.penaltyCount} {t("evaluation.legendPenalty").toLowerCase()} {t("daily.date").toLowerCase()}
      </p>
      {d.teacherNames.length > 0 && (
        <div className="space-y-1.5 border-t border-border pt-2">
          <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wide">{t("daily.teachers")}</p>
          {d.teacherNames.map((name, i) => (
            <div key={i} className="flex items-center justify-between gap-2">
              <span className="text-xs text-foreground truncate">{name || "—"}</span>
              <Badge className="text-[10px] px-1.5 py-0 h-4 shrink-0 bg-amber-500/10 text-amber-700 border-amber-500/20">
                -1
              </Badge>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ── Main component ─────────────────────────────────────────────────────────────

interface Props {
  studentId: string;
  rawEvals: DailyEvalRecord[];
  competencies: Competency[];
  classTeachers: ClassTeacher[];
  recoveryActions?: SkillRecoveryAction[];
}

export function DailyGranularAnalytics({ studentId, rawEvals, competencies, classTeachers, recoveryActions = [] }: Props) {
  const { t, lang } = useI18n();
  const locale = lang === "ar" ? "ar-MA" : "fr-FR";
  const today = new Date().toISOString().split("T")[0];
  const [selectedDate, setSelectedDate] = useState(today);
  const [selectedCompId, setSelectedCompId] = useState<string | null>(null);

  // Penalty records for this student
  const studentPenalties = useMemo(
    () => rawEvals.filter((e) => e.studentId === studentId),
    [rawEvals, studentId],
  );

  // Penalties on the selected day
  const dayPenalties = useMemo(
    () => studentPenalties.filter((e) => e.date === selectedDate),
    [studentPenalties, selectedDate],
  );

  // Level-1 chart: one bar per competency that had a penalty on the selected day
  const chartData = useMemo<ChartEntry[]>(() => {
    return competencies
      .map((comp) => {
        const todayComp = dayPenalties.filter((e) => e.competencyId === comp.id);
        if (todayComp.length === 0) return null;
        const globalScore = competencyScoreFromLedger(studentPenalties, recoveryActions, studentId, comp.id);
        return {
          id: comp.id,
          code: comp.code,
          title: localizeCompTitle(comp.code, comp.title, lang),
          rate: globalScore,
          penaltyCount: todayComp.length,
          teacherNames: [...new Set(todayComp.map((e) => e.teacherName).filter(Boolean))],
        };
      })
      .filter((d): d is ChartEntry => d !== null);
  }, [dayPenalties, studentPenalties, recoveryActions, studentId, competencies, lang]);

  const selectedComp = selectedCompId
    ? competencies.find((c) => c.id === selectedCompId) ?? null
    : null;

  // Level-2: each class teacher vs whether they penalized on this day for selected competency
  const teacherBreakdown = useMemo(() => {
    if (!selectedCompId) return [];
    const penalizedByTeacher = new Set(
      dayPenalties.filter((e) => e.competencyId === selectedCompId).map((e) => e.teacherId)
    );
    return classTeachers.map((teacher) => ({
      teacher,
      penalized: penalizedByTeacher.has(teacher.id),
    }));
  }, [selectedCompId, dayPenalties, classTeachers]);

  const dateLabel = new Date(selectedDate + "T00:00:00").toLocaleDateString(locale, {
    weekday: "long", day: "numeric", month: "long", year: "numeric",
  });

  return (
    <Card className="border-border/50">
      <CardHeader className="pb-3">
        <CardTitle className="text-base font-semibold flex items-center gap-2">
          <BarChart2 className="w-4 h-4 text-primary" />
          {t("daily.title")}
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">

        {/* ── Date picker ──────────────────────────────────────── */}
        <div className="flex flex-wrap items-center gap-3">
          <Label className="text-xs text-muted-foreground shrink-0">{t("daily.date")}</Label>
          <Input
            type="date"
            value={selectedDate}
            max={today}
            onChange={(e) => { setSelectedDate(e.target.value); setSelectedCompId(null); }}
            className="h-8 w-44 text-sm"
          />
          <span className="text-xs text-muted-foreground capitalize">{dateLabel}</span>
        </div>

        {/* ── Level-1: competency bar chart ─────────────────────── */}
        {chartData.length === 0 ? (
          <div className="py-10 text-center text-sm text-muted-foreground border border-dashed border-border/60 rounded-xl">
            {t("daily.noEvalDay")}
          </div>
        ) : (
          <>
            <p className="text-[11px] text-muted-foreground">
              {t("daily.hint")}
            </p>
            <div className="h-[220px]">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart
                  data={chartData}
                  margin={{ top: 8, right: 8, left: -20, bottom: 0 }}
                  onClick={(d) => {
                    const p = (d?.activePayload?.[0]?.payload) as ChartEntry | undefined;
                    if (p) setSelectedCompId((prev) => prev === p.id ? null : p.id);
                  }}
                >
                  <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                  <XAxis dataKey="code" tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }} />
                  <YAxis domain={[0, 100]} tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }} unit="%" />
                  <Tooltip content={<DayCompTooltip />} />
                  <Bar dataKey="rate" radius={[4, 4, 0, 0]} cursor="pointer">
                    {chartData.map((entry, i) => (
                      <Cell
                        key={i}
                        fill={barColor(entry.rate)}
                        opacity={selectedCompId && selectedCompId !== entry.id ? 0.35 : 1}
                      />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>

            <div className="flex items-center gap-4 text-xs text-muted-foreground justify-center flex-wrap">
              <span className="flex items-center gap-1.5"><span className="w-3 h-3 rounded-sm inline-block" style={{ background: "hsl(122 39% 49%)" }} /> {t("status.acquisLong")}</span>
              <span className="flex items-center gap-1.5"><span className="w-3 h-3 rounded-sm inline-block" style={{ background: "hsl(38 92% 50%)" }} /> {t("status.enCoursLong")}</span>
              <span className="flex items-center gap-1.5"><span className="w-3 h-3 rounded-sm inline-block" style={{ background: "hsl(4 77% 55%)" }} /> {t("status.nonAcquisLong")}</span>
            </div>
          </>
        )}

        {/* ── Level-2: teacher breakdown drill-down ─────────────── */}
        {selectedComp && (
          <div className="border border-primary/20 rounded-xl p-4 space-y-3 bg-primary/5">
            {/* Header */}
            <div className="flex items-center gap-2">
              <Button
                size="sm"
                variant="ghost"
                className="h-7 px-2 gap-1 text-xs"
                onClick={() => setSelectedCompId(null)}
              >
                <ChevronLeft className="w-3.5 h-3.5 rtl:rotate-180" /> {t("daily.back")}
              </Button>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-semibold truncate">
                  {selectedComp.code} — {localizeCompTitle(selectedComp.code, selectedComp.title, lang)}
                </p>
              </div>
            </div>

            <div className="flex items-center gap-1.5">
              <Users className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
              <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
                {t("daily.classDetail")}
              </p>
            </div>

            {classTeachers.length === 0 ? (
              <p className="text-xs text-muted-foreground italic">
                {t("daily.noTeacherAssigned")}
              </p>
            ) : (
              <div className="divide-y divide-border/50 rounded-lg overflow-hidden border border-border/40 bg-card">
                {teacherBreakdown.map(({ teacher, penalized }) => (
                  <div
                    key={teacher.id}
                    className="flex items-center justify-between px-3 py-2.5 gap-3"
                  >
                    <span className="text-sm font-medium text-foreground">{teacher.name}</span>
                    {penalized ? (
                      <Badge className="text-xs shrink-0 bg-amber-500/10 text-amber-700 border-amber-500/20">
                        -1
                      </Badge>
                    ) : (
                      <span
                        className="text-xs text-muted-foreground bg-muted/50 px-2 py-0.5 rounded-md"
                        dir="rtl"
                      >
                        {t("daily.notEvaluated")}
                      </span>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

      </CardContent>
    </Card>
  );
}
