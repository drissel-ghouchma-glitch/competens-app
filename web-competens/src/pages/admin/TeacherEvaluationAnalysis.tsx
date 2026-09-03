import { useMemo, useState, type ReactNode } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "@/hooks/use-auth";
import { useTeacherEvaluationReport } from "@/hooks/use-teacher-evaluation-report";
import { useI18n } from "@/i18n";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableFooter, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { cn } from "@/lib/utils";
import {
  ArrowDown, ArrowDownUp, ArrowLeft, ArrowUp, BarChart3, BookOpenCheck,
  GraduationCap, Hash, Loader2, RefreshCw, Search, Users,
} from "lucide-react";

type SortMode = "total_desc" | "total_asc" | "name" | "competency";
type SortDirection = "asc" | "desc";

interface ReportRow {
  id: string;
  fullName: string;
  className: string;
  counts: Record<string, number>;
  total: number;
}

function heatClass(count: number, max: number): string {
  if (count === 0) return "bg-muted/25 text-muted-foreground";
  const intensity = max === 0 ? 0 : count / max;
  if (intensity >= 0.75) return "bg-primary text-primary-foreground";
  if (intensity >= 0.45) return "bg-primary/60 text-primary-foreground";
  if (intensity >= 0.2) return "bg-primary/30 text-primary";
  return "bg-primary/10 text-primary";
}

export default function TeacherEvaluationAnalysisPage() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const { t } = useI18n();
  const { teachers, classes, assignments, students, competencies, evaluations, loading, error, refetch } = useTeacherEvaluationReport();
  const [teacherId, setTeacherId] = useState("");
  const [classId, setClassId] = useState("all");
  const [search, setSearch] = useState("");
  const [sortMode, setSortMode] = useState<SortMode>("total_desc");
  const [sortCompetencyId, setSortCompetencyId] = useState("");
  const [sortDirection, setSortDirection] = useState<SortDirection>("desc");

  const canView = user?.role === "admin" || user?.role === "directeur";
  const orderedCompetencies = useMemo(() => [...competencies].sort((left, right) => left.order - right.order), [competencies]);
  const selectedTeacher = teachers.find((teacher) => teacher.id === teacherId);

  const teacherClassIds = useMemo(() => {
    if (!teacherId) return new Set<string>();
    const ids = assignments
      .filter((assignment) => assignment.teacherId === teacherId)
      .map((assignment) => assignment.classId);
    for (const classe of classes) {
      if (classe.teacherId === teacherId) ids.push(classe.id);
    }
    return new Set(ids);
  }, [assignments, classes, teacherId]);

  const availableClasses = useMemo(
    () => classes.filter((classe) => teacherClassIds.has(classe.id)),
    [classes, teacherClassIds],
  );
  const visibleClassIds = useMemo(() => new Set(
    classId === "all" ? availableClasses.map((classe) => classe.id) : [classId],
  ), [availableClasses, classId]);
  const classNameById = useMemo(() => new Map(classes.map((classe) => [classe.id, classe.name])), [classes]);

  const reportRows = useMemo(() => {
    if (!teacherId) return [];
    const countByStudentCompetency = new Map<string, number>();
    for (const evaluation of evaluations) {
      if (evaluation.teacherId !== teacherId || !visibleClassIds.has(evaluation.classId)) continue;
      const key = `${evaluation.studentId}:${evaluation.competencyId}`;
      countByStudentCompetency.set(key, (countByStudentCompetency.get(key) ?? 0) + 1);
    }

    return students
      .filter((student) => visibleClassIds.has(student.classId))
      .map((student): ReportRow => {
        const counts = Object.fromEntries(orderedCompetencies.map((competency) => [
          competency.id,
          countByStudentCompetency.get(`${student.id}:${competency.id}`) ?? 0,
        ]));
        return {
          id: student.id,
          fullName: `${student.lastName} ${student.firstName}`.trim(),
          className: classNameById.get(student.classId) ?? "",
          counts,
          total: Object.values(counts).reduce((sum, count) => sum + count, 0),
        };
      });
  }, [classNameById, evaluations, orderedCompetencies, students, teacherId, visibleClassIds]);

  const displayedRows = useMemo(() => {
    const query = search.trim().toLocaleLowerCase();
    const rows = query
      ? reportRows.filter((row) => `${row.fullName} ${row.className}`.toLocaleLowerCase().includes(query))
      : reportRows;
    return [...rows].sort((left, right) => {
      if (sortMode === "name") return left.fullName.localeCompare(right.fullName);
      if (sortMode === "total_asc") return left.total - right.total || left.fullName.localeCompare(right.fullName);
      if (sortMode === "competency" && sortCompetencyId) {
        const difference = (left.counts[sortCompetencyId] ?? 0) - (right.counts[sortCompetencyId] ?? 0);
        return (sortDirection === "desc" ? -difference : difference) || left.fullName.localeCompare(right.fullName);
      }
      return right.total - left.total || left.fullName.localeCompare(right.fullName);
    });
  }, [reportRows, search, sortCompetencyId, sortDirection, sortMode]);

  const competencyTotals = useMemo(() => Object.fromEntries(orderedCompetencies.map((competency) => [
    competency.id,
    displayedRows.reduce((sum, row) => sum + (row.counts[competency.id] ?? 0), 0),
  ])), [displayedRows, orderedCompetencies]);
  const totalEvaluations = displayedRows.reduce((sum, row) => sum + row.total, 0);
  const maxCellValue = Math.max(0, ...displayedRows.flatMap((row) => Object.values(row.counts)));
  const mostUsedCompetency = useMemo(() => orderedCompetencies
    .map((competency) => ({ competency, total: competencyTotals[competency.id] ?? 0 }))
    .sort((left, right) => right.total - left.total)[0], [competencyTotals, orderedCompetencies]);

  const selectTeacher = (id: string) => {
    setTeacherId(id);
    setClassId("all");
    setSearch("");
    setSortMode("total_desc");
    setSortCompetencyId("");
  };

  const sortByCompetency = (competencyId: string) => {
    if (sortMode === "competency" && sortCompetencyId === competencyId) {
      setSortDirection((direction) => direction === "desc" ? "asc" : "desc");
      return;
    }
    setSortCompetencyId(competencyId);
    setSortDirection("desc");
    setSortMode("competency");
  };

  if (!canView) {
    return (
      <Card className="border-destructive/30">
        <CardContent className="p-8 text-center text-destructive">{t("teacherReport.accessDenied")}</CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-6 animate-in fade-in duration-500">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <div className="flex items-center gap-2">
            <BarChart3 className="h-6 w-6 text-primary" />
            <h1 className="text-2xl font-bold tracking-tight">{t("teacherReport.title")}</h1>
          </div>
          <p className="mt-1 text-sm text-muted-foreground">{t("teacherReport.subtitle")}</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={() => void refetch()} disabled={loading} className="gap-2">
            {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
            {t("common.refresh")}
          </Button>
          <Button variant="ghost" size="sm" onClick={() => navigate("/teachers")} className="gap-2">
            <ArrowLeft className="h-4 w-4" /> {t("teacherReport.back")}
          </Button>
        </div>
      </div>

      {error && <div className="rounded-lg border border-destructive/30 bg-destructive/10 p-3 text-sm text-destructive">{error}</div>}

      <Card className="border-border/50">
        <CardContent className="grid gap-3 p-4 md:grid-cols-[minmax(220px,1fr)_minmax(180px,0.7fr)_minmax(220px,1fr)_minmax(190px,0.6fr)]">
          <div className="space-y-1.5">
            <label className="text-xs font-medium text-muted-foreground">{t("teacherReport.teacher")}</label>
            <Select value={teacherId} onValueChange={selectTeacher}>
              <SelectTrigger><SelectValue placeholder={t("teacherReport.selectTeacher")} /></SelectTrigger>
              <SelectContent>
                {teachers.map((teacher) => <SelectItem key={teacher.id} value={teacher.id}>{teacher.fullName}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <label className="text-xs font-medium text-muted-foreground">{t("teacherReport.class")}</label>
            <Select value={classId} onValueChange={setClassId} disabled={!teacherId}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">{t("teacherReport.allClasses")}</SelectItem>
                {availableClasses.map((classe) => <SelectItem key={classe.id} value={classe.id}>{classe.name}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <label className="text-xs font-medium text-muted-foreground">{t("teacherReport.search")}</label>
            <div className="relative">
              <Search className="absolute start-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input value={search} onChange={(event) => setSearch(event.target.value)} disabled={!teacherId} className="ps-9" placeholder={t("teacherReport.searchPlaceholder")} />
            </div>
          </div>
          <div className="space-y-1.5">
            <label className="text-xs font-medium text-muted-foreground">{t("teacherReport.sort")}</label>
            <Select value={sortMode} onValueChange={(value) => setSortMode(value as SortMode)} disabled={!teacherId}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="total_desc">{t("teacherReport.sortMost")}</SelectItem>
                <SelectItem value="total_asc">{t("teacherReport.sortLeast")}</SelectItem>
                <SelectItem value="name">{t("teacherReport.sortName")}</SelectItem>
                <SelectItem value="competency" disabled>{t("teacherReport.sortCompetency")}</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </CardContent>
      </Card>

      {!teacherId ? (
        <Card className="border-dashed border-2">
          <CardContent className="flex flex-col items-center p-12 text-center text-muted-foreground">
            <GraduationCap className="mb-3 h-10 w-10 opacity-40" />
            <p>{t("teacherReport.selectTeacherPrompt")}</p>
          </CardContent>
        </Card>
      ) : loading ? (
        <div className="flex justify-center py-20"><Loader2 className="h-8 w-8 animate-spin text-muted-foreground" /></div>
      ) : (
        <>
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            <SummaryCard icon={<Users className="h-5 w-5" />} label={t("teacherReport.studentsShown")} value={String(displayedRows.length)} />
            <SummaryCard icon={<Hash className="h-5 w-5" />} label={t("teacherReport.totalEvaluations")} value={String(totalEvaluations)} />
            <SummaryCard icon={<BarChart3 className="h-5 w-5" />} label={t("teacherReport.averagePerStudent")} value={displayedRows.length ? (totalEvaluations / displayedRows.length).toFixed(1) : "0"} />
            <SummaryCard icon={<BookOpenCheck className="h-5 w-5" />} label={t("teacherReport.mostUsed")} value={mostUsedCompetency?.total ? `${mostUsedCompetency.competency.code} - ${mostUsedCompetency.total}` : "-"} />
          </div>

          <Card className="overflow-hidden border-border/50">
            <CardHeader className="border-b bg-muted/20 py-4">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <CardTitle className="text-base">{selectedTeacher?.fullName}</CardTitle>
                <div className="flex items-center gap-2 text-xs text-muted-foreground">
                  <span className="inline-block h-3 w-3 rounded-sm bg-primary/10" /> {t("teacherReport.lowActivity")}
                  <span className="inline-block h-3 w-3 rounded-sm bg-primary" /> {t("teacherReport.highActivity")}
                  <Badge variant="outline">{t("teacherReport.currentYear")}</Badge>
                </div>
              </div>
            </CardHeader>
            <CardContent className="p-0">
              <Table className="min-w-max">
                <TableHeader className="sticky top-0 z-20 bg-card">
                  <TableRow>
                    <TableHead className="sticky start-0 z-30 min-w-56 bg-card text-start">{t("teacherReport.student")}</TableHead>
                    {orderedCompetencies.map((competency) => {
                      const active = sortMode === "competency" && sortCompetencyId === competency.id;
                      return (
                        <TableHead key={competency.id} className="min-w-20 px-2 text-center">
                          <button onClick={() => sortByCompetency(competency.id)} className={cn("mx-auto flex items-center gap-1 rounded px-1.5 py-1 hover:bg-muted", active && "bg-primary/10 text-primary")} title={competency.title}>
                            <span className="font-mono font-semibold">{competency.code}</span>
                            {active ? (sortDirection === "desc" ? <ArrowDown className="h-3 w-3" /> : <ArrowUp className="h-3 w-3" />) : <ArrowDownUp className="h-3 w-3 opacity-50" />}
                          </button>
                        </TableHead>
                      );
                    })}
                    <TableHead className="sticky end-0 z-30 min-w-20 bg-card text-center font-bold">{t("teacherReport.total")}</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {displayedRows.map((row, index) => (
                    <TableRow key={row.id}>
                      <TableCell className="sticky start-0 z-10 bg-card py-3 font-medium">
                        <div className="flex items-center gap-2">
                          <span className="flex h-7 w-7 items-center justify-center rounded-md bg-muted text-xs font-mono text-muted-foreground">{index + 1}</span>
                          <div>
                            <p className="text-sm">{row.fullName}</p>
                            {classId === "all" && <p className="text-xs font-normal text-muted-foreground">{row.className}</p>}
                          </div>
                        </div>
                      </TableCell>
                      {orderedCompetencies.map((competency) => {
                        const count = row.counts[competency.id] ?? 0;
                        return <TableCell key={competency.id} className="px-2 text-center"><span className={cn("inline-flex min-w-9 justify-center rounded-md px-2 py-1 font-mono text-xs font-semibold", heatClass(count, maxCellValue))}>{count}</span></TableCell>;
                      })}
                      <TableCell className="sticky end-0 z-10 bg-card text-center font-mono font-bold text-primary">{row.total}</TableCell>
                    </TableRow>
                  ))}
                  {displayedRows.length === 0 && (
                    <TableRow><TableCell colSpan={orderedCompetencies.length + 2} className="py-12 text-center text-muted-foreground">{t("teacherReport.noStudents")}</TableCell></TableRow>
                  )}
                </TableBody>
                <TableFooter>
                  <TableRow>
                    <TableCell className="sticky start-0 z-10 bg-muted/95 font-bold">{t("teacherReport.total")}</TableCell>
                    {orderedCompetencies.map((competency) => <TableCell key={competency.id} className="px-2 text-center font-mono font-bold">{competencyTotals[competency.id] ?? 0}</TableCell>)}
                    <TableCell className="sticky end-0 z-10 bg-muted/95 text-center font-mono font-bold text-primary">{totalEvaluations}</TableCell>
                  </TableRow>
                </TableFooter>
              </Table>
            </CardContent>
          </Card>
        </>
      )}
    </div>
  );
}

function SummaryCard({ icon, label, value }: { icon: ReactNode; label: string; value: string }) {
  return (
    <Card className="border-border/50">
      <CardContent className="flex items-center gap-3 p-4">
        <div className="rounded-lg bg-primary/10 p-2 text-primary">{icon}</div>
        <div className="min-w-0"><p className="text-xs text-muted-foreground">{label}</p><p className="truncate text-lg font-bold">{value}</p></div>
      </CardContent>
    </Card>
  );
}
