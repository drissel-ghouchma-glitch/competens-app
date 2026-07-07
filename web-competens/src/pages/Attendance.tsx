import { useState, useEffect, useRef, useCallback } from "react";
import { useAttendance } from "@/hooks/use-attendance";
import { useAuth } from "@/hooks/use-auth";
import { useI18n } from "@/i18n";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { CheckCircle, XCircle, Loader2, Save, Users, ClipboardList } from "lucide-react";
import type { AttendanceStatus, DailyAttendanceInput, Student } from "@/types";
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

  const {
    classes, loading, error,
    getStudentsForClass,
    attendanceMap, attendanceLoading,
    loadAttendance, saveAttendance,
  } = useAttendance();

  const [selectedClassId, setSelectedClassId] = useState<string>("");
  const [selectedDate, setSelectedDate] = useState<string>(todayStr());
  const [students, setStudents] = useState<Student[]>([]);
  const [localStatus, setLocalStatus] = useState<Record<string, AttendanceStatus>>({});
  const [saving, setSaving] = useState(false);

  // Ref to track which (classId, date) was last loaded — prevents stale map application
  const loadedKeyRef = useRef("");

  // Auto-select first class once classes are loaded
  useEffect(() => {
    if (classes.length > 0 && !selectedClassId) setSelectedClassId(classes[0].id);
  }, [classes, selectedClassId]);

  // When class changes, update student list
  useEffect(() => {
    if (!selectedClassId) { setStudents([]); return; }
    setStudents(getStudentsForClass(selectedClassId));
  }, [selectedClassId, getStudentsForClass]);

  // When class or date changes → reset local to "present" + load from backend
  useEffect(() => {
    if (!selectedClassId) return;
    const key = `${selectedClassId}:${selectedDate}`;
    loadedKeyRef.current = key;
    // Default all to present
    setLocalStatus((prev) => {
      const next: Record<string, AttendanceStatus> = {};
      for (const s of students) next[s.id] = prev[s.id] ?? "present";
      return next;
    });
    loadAttendance(selectedClassId, selectedDate);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedClassId, selectedDate]);

  // Re-init when students list changes (e.g., class changed and students were re-fetched)
  useEffect(() => {
    if (!selectedClassId || students.length === 0) return;
    setLocalStatus((prev) => {
      const next: Record<string, AttendanceStatus> = {};
      for (const s of students) next[s.id] = prev[s.id] ?? "present";
      return next;
    });
  }, [students]);

  // When attendanceMap resolves, overlay the saved statuses on top of the defaults
  useEffect(() => {
    if (attendanceLoading) return;
    const key = `${selectedClassId}:${selectedDate}`;
    if (loadedKeyRef.current !== key) return;
    if (Object.keys(attendanceMap).length === 0) return;
    setLocalStatus((prev) => {
      const next = { ...prev };
      for (const [id, status] of Object.entries(attendanceMap)) {
        if (id in next) next[id] = status;
      }
      return next;
    });
  }, [attendanceMap, attendanceLoading, selectedClassId, selectedDate]);

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
      await saveAttendance(selectedClassId, selectedDate, inputs);
      toast.success(t("attendance.saved"));
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : t("common.saveError"));
    } finally {
      setSaving(false);
    }
  };

  const presentCount = students.filter((s) => (localStatus[s.id] ?? "present") === "present").length;
  const absentCount  = students.filter((s) => (localStatus[s.id] ?? "present") === "absent").length;

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
          </div>
        </CardContent>
      </Card>

      {error && (
        <div className="rounded-lg border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive">{error}</div>
      )}

      {/* Loading skeleton */}
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
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-1.5 p-4 pt-2">
              {students.map((s) => {
                const status = localStatus[s.id] ?? "present";
                const isPresent = status === "present";
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
                    {/* Avatar */}
                    <div className={`w-9 h-9 rounded-full flex items-center justify-center text-xs font-bold shrink-0 ${
                      isPresent
                        ? "bg-green-500/15 text-green-700 dark:text-green-400"
                        : "bg-red-500/15 text-red-700 dark:text-red-400"
                    }`}>
                      {s.firstName[0]}{s.lastName[0]}
                    </div>

                    {/* Name */}
                    <div className="flex-1 min-w-0">
                      <p className="font-medium text-sm text-foreground">
                        {s.lastName} <span className="font-normal">{s.firstName}</span>
                      </p>
                    </div>

                    {/* Status */}
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

          {/* Save — teachers only */}
          {isTeacher && (
            <div className="flex justify-end gap-2">
              <Button onClick={handleSave} disabled={saving} className="gap-2">
                {saving
                  ? <Loader2 className="w-4 h-4 animate-spin" />
                  : <Save className="w-4 h-4" />}
                {t("attendance.saveBtn")}
              </Button>
            </div>
          )}
        </>
      )}
    </div>
  );
}
