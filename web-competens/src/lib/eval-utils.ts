import type { EvaluationStatus } from "@/types";

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
