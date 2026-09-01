import { useState, useEffect, useRef, useCallback } from "react";
import { useAttendance } from "@/hooks/use-attendance";
import { useAuth } from "@/hooks/use-auth";
import { useI18n } from "@/i18n";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { CheckCircle, XCircle, Loader2, Save, Users, ClipboardList, ShieldCheck, Sun, Sunset } from "lucide-react";
import type { AttendanceStatus, AttendancePeriod, DailyAttendanceInput, Student } from "@/types";
import { toast } from "sonner";

function todayStr() {
  return new Date().toISOString().split("T")[0];
}

export default function AttendancePage() {
  const { user } = useAuth();
  const { t, lang } = useI18n();
  const locale = lang === "ar" ? "ar-MA" : "fr-FR";
  const role = user?.role ?? "professeur";
  const isTeacher = role === "professeur";
  const isAdmin = role === "admin" || role === "directeur";

  const {
    classes, loading, error,
    getStudentsForClass,
    attendanceMap, confirmedStudentIds, attendanceLoading,
    loadAttendance, saveAttendance, confirmAttendance,
  } = useAttendance();

  const [selectedClassId, setSelectedClassId] = useState<string>("");
  const [selectedDate, setSelectedDate] = useState<string>(todayStr());
  const [period, setPeriod] = useState<AttendancePeriod>("morning");
  const [students, setStudents] = useState<Student[]>([]);
  const [localStatus, setLocalStatus] = useState<Record<string, AttendanceStatus>>({});
  const [saving, setSaving] = useState(false);
  const [confirming, setConfirming] = useState(false);

  // Includes period in the key to avoid stale map application across period switches
  const loadedKeyRef = useRef("");

  useEffect(() => {
    if (classes.length > 0 && !selectedClassId) setSelectedClassId(classes[0].id);
  }, [classes, selectedClassId]);

  useEffect(() => {
    if (!selectedClassId) { setStudents([]); return; }
    setStudents(getStudentsForClass(selectedClassId));
  }, [selectedClassId, getStudentsForClass]);

  // When class, date, or period changes → reset defaults + load from backend
  useEffect(() => {
    if (!selectedClassId) return;
    const key = `${selectedClassId}:${selectedDate}:${period}`;
    loadedKeyRef.current = key;
    setLocalStatus((prev) => {
      const next: Record<string, AttendanceStatus> = {};
      for (const s of students) next[s.id] = prev[s.id] ?? "present";
      return next;
    });
    loadAttendance(selectedClassId, selectedDate, period);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedClassId, selectedDate, period]);

  useEffect(() => {
    if (!selectedClassId || students.length === 0) return;
    setLocalStatus((prev) => {
      const next: Record<string, AttendanceStatus> = {};
      for (const s of students) next[s.id] = prev[s.id] ?? "present";
      return next;
    });
  }, [students]);

  useEffect(() => {
    if (attendanceLoading) return;
    const key = `${selectedClassId}:${selectedDate}:${period}`;
    if (loadedKeyRef.current !== key) return;
    if (Object.keys(attendanceMap).length === 0) return;
    setLocalStatus((prev) => {
      const next = { ...prev };
      for (const [id, status] of Object.entries(attendanceMap)) {
        if (id in next) next[id] = status;
      }
      return next;
    });
  }, [attendanceMap, attendanceLoading, selectedClassId, selectedDate, period]);

  const toggleStatus = useCallback((studentId: string) => {
    if (!isTeacher) return;
    setLocalStatus((prev) => ({
      ...prev,
      [studentId]: prev[studentId] === "present" ? "absent" : "present",
    }));
  }, [isTeacher]);

  const handleSave = async () => {
    if (!selectedClassId || students.length === 0) return;
    setSaving(true);
    try {
      const inputs: DailyAttendanceInput[] = students.map((s) => ({
        studentId: s.id,
        status: localStatus[s.id] ?? "present",
      }));
      await saveAttendance(selectedClassId, selectedDate, period, inputs);
      toast.success(t("attendance.saved"));
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : t("common.saveError"));
    } finally {
      setSaving(false);
    }
  };

  const handleConfirmAll = async () => {
    if (!selectedClassId) return;
    setConfirming(true);
    try {
      await confirmAttendance(selectedClassId, selectedDate, period);
      toast.success(t("attendance.confirmSuccess"));
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : t("common.saveError"));
    } finally {
      setConfirming(false);
    }
  };

  const presentCount = students.filter((s) => (localStatus[s.id] ?? "present") === "present").length;
  const absentCount  = students.filter((s) => (localStatus[s.id] ?? "present") === "absent").length;
  const allConfirmed = students.length > 0 && students.every((s) => confirmedStudentIds.has(s.id));

  const selectedClass = classes.find((c) => c.id === selectedClassId);
  const dateLabel = selectedDate
    ? new Date(selectedDate + "T00:00:00").toLocaleDateString(locale, { weekday: "long", day: "numeric", month: "long", year: "numeric" })
    : "";

  return (
    <div className="space-y-6 animate-in fade-in duration-500">

      {/* Page header */}
      <div>
        <h1 className="text-2xl font-bold tracking-tight">{t("attendance.title")}</h1>
        <p className="text-sm text-muted-foreground">
          {isTeacher ? t("attendance.subtitleTeacher") : t("attendance.subtitleAdmin")}
        </p>
      </div>

      {/* Controls */}
      <Card className="border-border/50">
        <CardContent className="p-4">
          <div className="flex flex-wrap gap-3 items-end">
            {/* Class selector */}
            <div className="flex-1 min-w-[180px]">
              <label className="text-xs font-medium text-muted-foreground mb-1.5 block">{t("attendance.class")}</label>
              <Select value={selectedClassId} onValueChange={setSelectedClassId}>
                <SelectTrigger>
                  <SelectValue placeholder={t("attendance.chooseClass")} />
                </SelectTrigger>
                <SelectContent>
                  {classes.map((c) => (
                    <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Date picker */}
            <div className="flex-1 min-w-[150px]">
              <label className="text-xs font-medium text-muted-foreground mb-1.5 block">{t("attendance.date")}</label>
              <input
                type="date"
                value={selectedDate}
                max={todayStr()}
                onChange={(e) => setSelectedDate(e.target.value)}
                className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
              />
            </div>

            {/* Period toggle */}
            <div>
              <label className="text-xs font-medium text-muted-foreground mb-1.5 block">{t("attendance.period")}</label>
              <div className="flex rounded-md border border-input overflow-hidden h-10">
                <button
                  type="button"
                  onClick={() => setPeriod("morning")}
                  className={`flex items-center gap-1.5 px-3 text-sm font-medium transition-colors ${
                    period === "morning"
                      ? "bg-primary text-primary-foreground"
                      : "bg-background text-muted-foreground hover:bg-muted"
                  }`}
                >
                  <Sun className="w-3.5 h-3.5" />
                  {t("attendance.morning")}
                </button>
                <button
                  type="button"
                  onClick={() => setPeriod("afternoon")}
                  className={`flex items-center gap-1.5 px-3 text-sm font-medium transition-colors ${
                    period === "afternoon"
                      ? "bg-primary text-primary-foreground"
                      : "bg-background text-muted-foreground hover:bg-muted"
                  }`}
                >
                  <Sunset className="w-3.5 h-3.5" />
                  {t("attendance.afternoon")}
                </button>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {error && (
        <div className="rounded-lg border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive">{error}</div>
      )}

      {loading ? (
        <div className="flex items-center justify-center py-20">
          <Loader2 className="w-8 h-8 animate-spin text-muted-foreground" />
        </div>
      ) : !selectedClassId ? (
        <Card className="border-dashed border-2">
          <CardContent className="p-12 text-center text-muted-foreground">
            <Users className="w-10 h-10 mx-auto mb-3 opacity-40" />
            <p>{t("attendance.selectClassPrompt")}</p>
          </CardContent>
        </Card>
      ) : students.length === 0 ? (
        <Card className="border-dashed border-2">
          <CardContent className="p-12 text-center text-muted-foreground">
            <Users className="w-10 h-10 mx-auto mb-3 opacity-40" />
            <p>{t("attendance.noStudents")}</p>
          </CardContent>
        </Card>
      ) : (
        <>
          {/* Summary badges */}
          <div className="flex items-center gap-3 flex-wrap">
            <Badge variant="secondary" className="gap-1.5 text-sm px-3 py-1">
              <CheckCircle className="w-3.5 h-3.5 text-green-500" />
              {t("attendance.present", { count: presentCount })}
            </Badge>
            <Badge variant="secondary" className="gap-1.5 text-sm px-3 py-1">
              <XCircle className="w-3.5 h-3.5 text-red-500" />
              {t("attendance.absent", { count: absentCount })}
            </Badge>
            {/* Confirmation status badge */}
            {Object.keys(attendanceMap).length > 0 && (
              <Badge
                variant="outline"
                className={`gap-1.5 text-sm px-3 py-1 ${
                  allConfirmed
                    ? "border-green-500/40 text-green-600"
                    : "border-amber-400/50 text-amber-600"
                }`}
              >
                <ShieldCheck className="w-3.5 h-3.5" />
                {allConfirmed ? t("attendance.confirmedBadge") : t("attendance.pendingBadge")}
              </Badge>
            )}
            {attendanceLoading && (
              <Loader2 className="w-4 h-4 animate-spin text-muted-foreground" />
            )}
            {isTeacher && (
              <span className="text-xs text-muted-foreground ms-auto hidden sm:block">
                {t("attendance.clickHint")}
              </span>
            )}
          </div>

          {/* Student list */}
          <Card className="border-border/50">
            <CardHeader className="pb-2">
              <CardTitle className="text-base font-semibold flex items-center gap-2">
                <ClipboardList className="w-4 h-4 text-primary" />
                {selectedClass?.name} — {dateLabel}
                <Badge variant="secondary" className="ms-1 font-normal text-xs">
                  {period === "morning" ? t("attendance.morning") : t("attendance.afternoon")}
                </Badge>
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-1.5 p-4 pt-2">
              {students.map((s) => {
                const status = localStatus[s.id] ?? "present";
                const isPresent = status === "present";
                const isConfirmed = confirmedStudentIds.has(s.id);
                return (
                  <div
                    key={s.id}
                    onClick={() => toggleStatus(s.id)}
                    className={`flex items-center gap-3 px-4 py-3 rounded-xl border transition-all duration-150 ${
                      isTeacher ? "cursor-pointer hover:shadow-sm active:scale-[0.99]" : "cursor-default"
                    } ${
                      isPresent
                        ? "bg-green-500/5 border-green-500/20 hover:bg-green-500/10"
                        : "bg-red-500/5 border-red-500/20 hover:bg-red-500/10"
                    }`}
                  >
                    <div className={`w-9 h-9 rounded-full flex items-center justify-center text-xs font-bold shrink-0 ${
                      isPresent
                        ? "bg-green-500/15 text-green-700 dark:text-green-400"
                        : "bg-red-500/15 text-red-700 dark:text-red-400"
                    }`}>
                      {s.firstName[0]}{s.lastName[0]}
                    </div>

                    <div className="flex-1 min-w-0">
                      <p className="font-medium text-sm text-foreground">
                        {s.lastName} <span className="font-normal">{s.firstName}</span>
                      </p>
                    </div>

                    {/* Confirmation indicator for admin */}
                    {isAdmin && isConfirmed && (
                      <ShieldCheck className="w-4 h-4 text-green-500 shrink-0" />
                    )}

                    <span className={`text-xs font-semibold hidden sm:block ${isPresent ? "text-green-600" : "text-red-600"}`}>
                      {isPresent ? t("attendance.presentLabel") : t("attendance.absentLabel")}
                    </span>
                    {isPresent
                      ? <CheckCircle className="w-5 h-5 text-green-500 shrink-0" />
                      : <XCircle className="w-5 h-5 text-red-500 shrink-0" />}
                  </div>
                );
              })}
            </CardContent>
          </Card>

          {/* Action buttons */}
          <div className="sticky bottom-16 z-20 -mx-4 flex justify-end gap-2 flex-wrap border-t border-border/70 bg-background/95 px-4 pt-3 pb-3 shadow-[0_-6px_18px_-12px_hsl(var(--foreground)/0.35)] backdrop-blur sm:static sm:mx-0 sm:border-0 sm:bg-transparent sm:p-0 sm:shadow-none sm:backdrop-blur-none">
            {/* Confirm All — admins/directeurs only, only when there are saved records not yet confirmed */}
            {isAdmin && Object.keys(attendanceMap).length > 0 && !allConfirmed && (
              <Button
                variant="outline"
                onClick={handleConfirmAll}
                disabled={confirming}
                className="gap-2 border-green-500/40 text-green-700 hover:bg-green-500/10"
              >
                {confirming
                  ? <Loader2 className="w-4 h-4 animate-spin" />
                  : <ShieldCheck className="w-4 h-4" />}
                {t("attendance.confirmAllBtn")}
              </Button>
            )}

            {/* Save — teachers only */}
            {isTeacher && (
              <Button onClick={handleSave} disabled={saving} className="w-full gap-2 sm:w-auto">
                {saving
                  ? <Loader2 className="w-4 h-4 animate-spin" />
                  : <Save className="w-4 h-4" />}
                {t("attendance.saveBtn")}
              </Button>
            )}
          </div>
        </>
      )}
    </div>
  );
}
