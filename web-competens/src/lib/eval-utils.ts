import type { EvaluationStatus, SkillRecoveryAction, SkillRecoveryActionType } from "@/types";

// Maps a numeric score (0-100) to the display status used by all charts.
// This is the single bridge between the penalty-count score and the
// Acquis / En cours / Non acquis categories rendered by every chart
// (StudentDetail, ParentDashboard, DailyGranularAnalytics).
//   90–100  → Acquis
//   51–89   → En cours
//   ≤50     → Non acquis
export function scoreToStatus(rate: number): EvaluationStatus {
  if (rate >= 90) return "acquis";
  if (rate > 50) return "en_cours";
  return "non_acquis";
}

// ── Timeline ──────────────────────────────────────────────────────────────────

export interface TimelinePoint {
  date: string;       // ISO "YYYY-MM-DD"
  rate: number;       // 100 - (penalty count on that day)
  teachers: string[]; // unique teacher names who applied penalties that day
  count: number;      // number of penalty events on that day
}

export interface PenaltyLedgerEvent {
  id?: string;
  studentId: string;
  competencyId: string;
  date: string;
  createdAt?: string;
  teacherId?: string;
  teacherName?: string;
}

export interface SkillHistoryPoint {
  id: string;
  date: string;
  createdAt: string;
  score: number;
  previousScore: number;
  type: "penalty" | SkillRecoveryActionType;
  actorName?: string;
  studentReason?: string;
  meetingNotes?: string;
}

/**
 * Applies the append-only ledger in chronological order.  A penalty deducts
 * one point from the score at that moment. A recovery action then explicitly
 * sets the score, so later penalties still apply normally.
 */
export function buildSkillHistory(
  penalties: PenaltyLedgerEvent[],
  recoveries: SkillRecoveryAction[],
  studentId: string,
  competencyId: string,
): SkillHistoryPoint[] {
  const events = [
    ...penalties
      .filter((event) => event.studentId === studentId && event.competencyId === competencyId)
      .map((event, index) => ({
        id: event.id ?? `penalty-${event.date}-${index}`,
        date: event.date,
        createdAt: event.createdAt ?? `${event.date}T00:00:00.000Z`,
        type: "penalty" as const,
        actorName: event.teacherName,
      })),
    ...recoveries
      .filter((event) => event.studentId === studentId && event.competencyId === competencyId)
      .map((event) => ({
        id: event.id,
        date: event.meetingDate,
        createdAt: event.createdAt,
        type: event.actionType,
        newScore: event.newScore,
        actorName: event.createdByName,
        studentReason: event.studentReason,
        meetingNotes: event.meetingNotes,
      })),
  ].sort((left, right) => left.date.localeCompare(right.date) || left.createdAt.localeCompare(right.createdAt));

  let score = 100;
  return events.map((event) => {
    const previousScore = score;
    score = event.type === "penalty" ? Math.max(0, score - 1) : event.newScore ?? score;
    return { ...event, score, previousScore };
  });
}

export function competencyScoreFromLedger(
  penalties: PenaltyLedgerEvent[],
  recoveries: SkillRecoveryAction[],
  studentId: string,
  competencyId: string,
): number {
  const history = buildSkillHistory(penalties, recoveries, studentId, competencyId);
  return history.length > 0 ? history[history.length - 1].score : 100;
}

// Builds a timeline from raw penalty records (no status field).
// Each record = one -1 deduction. For each date, rate = 100 - count.
// Dates with zero penalties never appear in the timeline.
export function buildTimeline(
  penalties: Array<{ date: string; teacherName?: string }>
): TimelinePoint[] {
  const byDate: Record<string, { count: number; teachers: Set<string> }> = {};
  for (const p of penalties) {
    if (!byDate[p.date]) byDate[p.date] = { count: 0, teachers: new Set() };
    byDate[p.date].count++;
    if (p.teacherName) byDate[p.date].teachers.add(p.teacherName);
  }
  return Object.entries(byDate)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([date, { count, teachers }]) => ({
      date,
      rate: Math.max(0, 100 - count),
      teachers: [...teachers],
      count,
    }));
}
