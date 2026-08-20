import { useEffect, useMemo, useState } from "react";
import { Activity } from "lucide-react";
import { CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useI18n } from "@/i18n";
import { buildSkillHistory, type PenaltyLedgerEvent, type SkillHistoryPoint } from "@/lib/eval-utils";
import type { Competency, SkillRecoveryAction } from "@/types";

interface Props {
  studentId: string;
  competencies: Competency[];
  penalties: PenaltyLedgerEvent[];
  recoveries: SkillRecoveryAction[];
}

function daysAgo(days: number) {
  const date = new Date();
  date.setDate(date.getDate() - days);
  return date.toISOString().slice(0, 10);
}

function HistoryTooltip({ active, payload }: { active?: boolean; payload?: Array<{ payload: SkillHistoryPoint }> }) {
  const { t, lang } = useI18n();
  if (!active || !payload?.length) return null;
  const event = payload[0].payload;
  const typeLabel = event.type === "penalty"
    ? t("skillHistory.penalty")
    : event.type === "reset_to_100"
      ? t("skillHistory.reset")
      : t("skillHistory.increase");
  return (
    <div className="min-w-52 rounded-xl border bg-popover p-3 text-xs shadow-lg">
      <p className="font-semibold text-foreground">
        {new Date(`${event.date}T00:00:00`).toLocaleDateString(lang === "ar" ? "ar-MA" : "fr-FR", { day: "numeric", month: "long", year: "numeric" })}
      </p>
      <p className="mt-1 font-medium text-foreground">{typeLabel}: {event.previousScore}% → {event.score}%</p>
      {event.actorName && <p className="mt-1 text-muted-foreground">{t("skillHistory.by")}: {event.actorName}</p>}
      {event.studentReason && <p className="mt-2 border-t pt-2 text-muted-foreground"><strong>{t("skillHistory.reason")}:</strong> {event.studentReason}</p>}
      {event.meetingNotes && <p className="mt-1 text-muted-foreground"><strong>{t("skillHistory.notes")}:</strong> {event.meetingNotes}</p>}
    </div>
  );
}

function HistoryDot({ cx, cy, payload }: { cx?: number; cy?: number; payload?: SkillHistoryPoint }) {
  if (cx === undefined || cy === undefined || !payload) return null;
  const color = payload.type === "penalty" ? "hsl(4 77% 55%)" : payload.type === "reset_to_100" ? "hsl(220 99% 62%)" : "hsl(142 71% 45%)";
  return <circle cx={cx} cy={cy} r={5} fill={color} stroke="hsl(var(--background))" strokeWidth={2} />;
}

/** Read-only, reusable chronological ledger chart for one student competency. */
export function SkillHistoryChart({ studentId, competencies, penalties, recoveries }: Props) {
  const { t, lang } = useI18n();
  const activeCompetencies = useMemo(() => competencies.filter((competency) => !competency.isArchived), [competencies]);
  const [competencyId, setCompetencyId] = useState("");
  const [startDate, setStartDate] = useState(() => daysAgo(30));
  const [endDate, setEndDate] = useState(() => new Date().toISOString().slice(0, 10));

  useEffect(() => {
    setCompetencyId((current) => activeCompetencies.some((competency) => competency.id === current)
      ? current
      : activeCompetencies[0]?.id ?? "");
  }, [activeCompetencies]);

  const history = useMemo(() => competencyId
    ? buildSkillHistory(penalties, recoveries, studentId, competencyId)
        .filter((event) => event.date >= startDate && event.date <= endDate)
        .map((event) => ({
          ...event,
          label: new Date(`${event.date}T00:00:00`).toLocaleDateString(lang === "ar" ? "ar-MA" : "fr-FR", { day: "2-digit", month: "2-digit" }),
        }))
    : [], [penalties, recoveries, studentId, competencyId, startDate, endDate, lang]);

  return (
    <Card className="border-border/50">
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-base font-semibold">
          <Activity className="h-4 w-4 text-primary" /> {t("skillHistory.title")}
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid gap-3 md:grid-cols-3">
          <div className="space-y-1.5">
            <Label className="text-xs">{t("skillHistory.competency")}</Label>
            <Select value={competencyId} onValueChange={setCompetencyId} disabled={activeCompetencies.length === 0}>
              <SelectTrigger><SelectValue placeholder={t("skillHistory.chooseCompetency")} /></SelectTrigger>
              <SelectContent>
                {activeCompetencies.map((competency) => (
                  <SelectItem key={competency.id} value={competency.id}>{competency.code} — {competency.title}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs">{t("skillHistory.from")}</Label>
            <Input type="date" value={startDate} max={endDate} onChange={(event) => setStartDate(event.target.value)} />
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs">{t("skillHistory.to")}</Label>
            <Input type="date" value={endDate} min={startDate} onChange={(event) => setEndDate(event.target.value)} />
          </div>
        </div>

        {history.length === 0 ? (
          <div className="rounded-xl border border-dashed py-10 text-center text-sm text-muted-foreground">
            {t("skillHistory.empty")}
          </div>
        ) : (
          <>
            <div className="h-72">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={history} margin={{ top: 12, right: 12, left: -18, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                  <XAxis dataKey="label" tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }} />
                  <YAxis domain={[0, 100]} unit="%" tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }} />
                  <Tooltip content={<HistoryTooltip />} />
                  <Line type="stepAfter" dataKey="score" stroke="hsl(220 99% 62%)" strokeWidth={2.5} dot={<HistoryDot />} activeDot={{ r: 7 }} />
                </LineChart>
              </ResponsiveContainer>
            </div>
            <div className="flex flex-wrap justify-center gap-4 text-xs text-muted-foreground">
              <span className="flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-full bg-red-500" />{t("skillHistory.penalty")}</span>
              <span className="flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-full bg-emerald-500" />{t("skillHistory.increase")}</span>
              <span className="flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-full bg-blue-500" />{t("skillHistory.reset")}</span>
            </div>
          </>
        )}
      </CardContent>
    </Card>
  );
}
