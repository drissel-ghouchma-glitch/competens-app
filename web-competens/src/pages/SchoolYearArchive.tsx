import { useMemo, useState, type ReactNode } from "react";
import { useNavigate, useParams } from "react-router-dom";
import {
  Archive,
  ArrowLeft,
  BookOpenCheck,
  CalendarCheck,
  ChevronRight,
  GraduationCap,
  Loader2,
  LockKeyhole,
  Search,
  Users,
} from "lucide-react";
import { useAuth } from "@/hooks/use-auth";
import { useSchoolYearArchive } from "@/hooks/use-school-year-archive";
import { useDemoStore } from "@/stores/demo";
import { useI18n } from "@/i18n";
import { localizeCompTitle } from "@/i18n/competency-content";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Progress } from "@/components/ui/progress";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

function scoreColor(score: number): string {
  if (score >= 90) return "text-emerald-600";
  if (score >= 50) return "text-amber-600";
  return "text-destructive";
}

export default function SchoolYearArchivePage() {
  const { yearId } = useParams<{ yearId: string }>();
  const navigate = useNavigate();
  const { user } = useAuth();
  const isDemo = useDemoStore((state) => state.isDemoMode);
  const { t, lang } = useI18n();
  const archive = useSchoolYearArchive(yearId);
  const [classFilter, setClassFilter] = useState("all");
  const [search, setSearch] = useState("");
  const [selectedStudentId, setSelectedStudentId] = useState<string | null>(null);

  const filteredStudents = useMemo(() => {
    const query = search.trim().toLowerCase();
    return archive.students.filter((student) => {
      if (classFilter !== "all" && student.classId !== classFilter) return false;
      return !query || `${student.firstName} ${student.lastName} ${student.className}`.toLowerCase().includes(query);
    });
  }, [archive.students, classFilter, search]);
  const selectedStudent = archive.students.find((student) => student.id === selectedStudentId) ?? null;

  if (!isDemo && user?.role !== "admin" && user?.role !== "directeur") {
    return (
      <Card className="mx-auto max-w-xl border-destructive/30">
        <CardContent className="p-8 text-center">
          <LockKeyhole className="mx-auto mb-3 h-10 w-10 text-destructive" />
          <p className="font-semibold">{t("archive.accessDenied")}</p>
        </CardContent>
      </Card>
    );
  }

  if (archive.loading) {
    return <div className="flex h-64 items-center justify-center"><Loader2 className="h-7 w-7 animate-spin text-primary" /></div>;
  }

  if (archive.error || !archive.schoolYear) {
    return (
      <div className="space-y-4">
        <Button variant="outline" onClick={() => navigate("/school-years")}>
          <ArrowLeft className="me-2 h-4 w-4 rtl:rotate-180" /> {t("common.back")}
        </Button>
        <div className="rounded-lg border border-destructive/30 bg-destructive/5 p-4 text-destructive">
          {archive.error ?? t("archive.notFound")}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6 animate-in fade-in duration-500">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <Button variant="ghost" size="sm" className="mb-2 -ms-3" onClick={() => navigate("/school-years")}>
            <ArrowLeft className="me-2 h-4 w-4 rtl:rotate-180" /> {t("common.back")}
          </Button>
          <h1 className="flex items-center gap-2 text-2xl font-bold tracking-tight">
            <Archive className="h-6 w-6 text-primary" />
            {t("archive.title", { year: archive.schoolYear.name })}
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">{t("archive.subtitle")}</p>
        </div>
        <Badge variant="secondary" className="w-fit gap-1.5 px-3 py-1.5">
          <LockKeyhole className="h-3.5 w-3.5" /> {t("archive.readOnly")}
        </Badge>
      </div>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <SummaryCard icon={<GraduationCap className="h-5 w-5" />} label={t("archive.classes")} value={archive.classes.length} />
        <SummaryCard icon={<Users className="h-5 w-5" />} label={t("archive.students")} value={archive.students.length} />
        <SummaryCard icon={<BookOpenCheck className="h-5 w-5" />} label={t("archive.evaluations")} value={archive.evaluationCount} />
        <SummaryCard icon={<CalendarCheck className="h-5 w-5" />} label={t("archive.attendanceRecords")} value={archive.attendanceCount} />
      </div>

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">{t("archive.classOverview")}</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {archive.classes.map((classe) => {
            const count = archive.students.filter((student) => student.classId === classe.id).length;
            return (
              <button
                key={classe.id}
                type="button"
                onClick={() => setClassFilter(classe.id)}
                className="rounded-xl border bg-muted/20 p-3 text-start transition-colors hover:border-primary/40 hover:bg-primary/5"
              >
                <div className="flex items-center justify-between gap-2">
                  <span className="font-semibold">{classe.name}</span>
                  <Badge variant="outline">{classe.levelCode}</Badge>
                </div>
                <p className="mt-2 text-xs text-muted-foreground">{t("archive.classCount", { count, capacity: classe.capacity })}</p>
              </button>
            );
          })}
        </CardContent>
      </Card>

      <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_minmax(360px,0.9fr)]">
        <Card>
          <CardHeader className="space-y-3 pb-3">
            <CardTitle className="text-base">{t("archive.studentList")}</CardTitle>
            <div className="flex flex-col gap-2 sm:flex-row">
              <div className="relative flex-1">
                <Search className="absolute start-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                <Input value={search} onChange={(event) => setSearch(event.target.value)} placeholder={t("archive.search")} className="ps-9" />
              </div>
              <Select value={classFilter} onValueChange={setClassFilter}>
                <SelectTrigger className="sm:w-52"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">{t("archive.allClasses")}</SelectItem>
                  {archive.classes.map((classe) => <SelectItem key={classe.id} value={classe.id}>{classe.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          </CardHeader>
          <CardContent className="space-y-2">
            {filteredStudents.map((student) => (
              <button
                key={student.id}
                type="button"
                onClick={() => setSelectedStudentId(student.id)}
                className={`flex w-full items-center gap-3 rounded-xl border p-3 text-start transition-colors ${
                  selectedStudentId === student.id ? "border-primary bg-primary/5" : "hover:bg-muted/40"
                }`}
              >
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-primary/10 font-semibold text-primary">
                  {student.firstName.charAt(0)}{student.lastName.charAt(0)}
                </div>
                <div className="min-w-0 flex-1">
                  <p className="truncate font-medium">{student.firstName} {student.lastName}</p>
                  <p className="text-xs text-muted-foreground">{student.className} · {student.levelCode}</p>
                </div>
                <div className="text-end">
                  <p className={`font-mono text-sm font-bold ${scoreColor(student.average)}`}>{student.average}%</p>
                  <p className="text-[10px] text-muted-foreground">{t(`studentDetail.enrollment.${student.enrollmentStatus}`)}</p>
                </div>
                <ChevronRight className="h-4 w-4 text-muted-foreground rtl:rotate-180" />
              </button>
            ))}
            {filteredStudents.length === 0 && <p className="py-10 text-center text-sm text-muted-foreground">{t("archive.emptyStudents")}</p>}
          </CardContent>
        </Card>

        <Card className="h-fit xl:sticky xl:top-4">
          <CardHeader className="pb-3">
            <CardTitle className="text-base">{t("archive.studentDetails")}</CardTitle>
          </CardHeader>
          <CardContent>
            {!selectedStudent ? (
              <div className="py-12 text-center text-sm text-muted-foreground">
                <Users className="mx-auto mb-3 h-9 w-9 opacity-50" />
                {t("archive.selectStudent")}
              </div>
            ) : (
              <div className="space-y-4">
                <div className="flex items-center justify-between gap-3 rounded-xl bg-muted/30 p-3">
                  <div>
                    <p className="font-semibold">{selectedStudent.firstName} {selectedStudent.lastName}</p>
                    <p className="text-xs text-muted-foreground">{selectedStudent.className}</p>
                  </div>
                  <div className="text-end">
                    <p className={`text-xl font-bold ${scoreColor(selectedStudent.average)}`}>{selectedStudent.average}%</p>
                    <p className="text-[10px] text-muted-foreground">{t("archive.finalAverage")}</p>
                  </div>
                </div>
                <div className="grid grid-cols-3 gap-2 text-center">
                  <MiniStat label={t("archive.evaluations")} value={selectedStudent.evaluationCount} />
                  <MiniStat label={t("archive.attendanceShort")} value={selectedStudent.attendanceCount} />
                  <MiniStat label={t("archive.absences")} value={selectedStudent.absenceCount} />
                </div>
                <div className="space-y-3">
                  {selectedStudent.skills.map((skill) => (
                    <div key={skill.competencyId} className="rounded-lg border p-3">
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0 flex-1">
                          <p className="font-medium">{skill.code}</p>
                          <p className="truncate text-xs text-muted-foreground">{localizeCompTitle(skill.code, skill.title, lang)}</p>
                        </div>
                        <span className={`font-mono text-sm font-bold ${scoreColor(skill.score)}`}>{skill.score}%</span>
                      </div>
                      <Progress value={skill.score} className="mt-2 h-1.5" />
                      <p className="mt-1 text-[10px] text-muted-foreground">{t("archive.penalties", { count: skill.penaltyCount })}</p>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

function SummaryCard({ icon, label, value }: { icon: ReactNode; label: string; value: number }) {
  return (
    <Card>
      <CardContent className="flex items-center gap-3 p-4">
        <div className="rounded-xl bg-primary/10 p-2.5 text-primary">{icon}</div>
        <div><p className="text-2xl font-bold">{value}</p><p className="text-xs text-muted-foreground">{label}</p></div>
      </CardContent>
    </Card>
  );
}

function MiniStat({ label, value }: { label: string; value: number }) {
  return <div className="rounded-lg bg-muted/40 p-2"><p className="font-bold">{value}</p><p className="text-[10px] text-muted-foreground">{label}</p></div>;
}
