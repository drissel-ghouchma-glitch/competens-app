import { useMemo, useState } from "react";
import { CheckCircle2, GraduationCap, Loader2, RefreshCw, ShieldAlert, Trophy, Users } from "lucide-react";
import { useAuth } from "@/hooks/use-auth";
import { useDemoStore } from "@/stores/demo";
import { usePrincipalClasses, type Belt } from "@/hooks/use-principal-classes";
import { useI18n } from "@/i18n";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { cn } from "@/lib/utils";
import { SkillRecoveryDialog } from "@/components/SkillRecoveryDialog";
import { SkillHistoryChart } from "@/components/SkillHistoryChart";

const beltConfig: Array<{ belt: Belt; dotClass: string; cardClass: string; scoreClass: string }> = [
  { belt: "white", dotClass: "bg-white border border-slate-300", cardClass: "border-slate-300 bg-slate-50/70 dark:bg-slate-950/20", scoreClass: "text-slate-700 dark:text-slate-200" },
  { belt: "yellow", dotClass: "bg-yellow-400", cardClass: "border-yellow-300 bg-yellow-50/70 dark:bg-yellow-950/20", scoreClass: "text-yellow-700 dark:text-yellow-300" },
  { belt: "green", dotClass: "bg-emerald-500", cardClass: "border-emerald-300 bg-emerald-50/70 dark:bg-emerald-950/20", scoreClass: "text-emerald-700 dark:text-emerald-300" },
  { belt: "blue", dotClass: "bg-blue-500", cardClass: "border-blue-300 bg-blue-50/70 dark:bg-blue-950/20", scoreClass: "text-blue-700 dark:text-blue-300" },
];

export default function PrincipalClassesPage() {
  const { user } = useAuth();
  const isDemo = useDemoStore((state) => state.isDemoMode);
  const { t } = useI18n();
  const {
    principalClasses, selectedClass, selectedClassId, setSelectedClassId,
    competencies, penalties, recoveries, recoveryRequests, studentScores, beltGroups, isManagement, loading, error, createRecoveryAction, refetch,
  } = usePrincipalClasses();
  const [selectedStudentId, setSelectedStudentId] = useState<string | null>(null);
  const [recoveryOpen, setRecoveryOpen] = useState(false);
  const [requestedCompetencyId, setRequestedCompetencyId] = useState<string | undefined>();
  const selectedStudent = useMemo(
    () => studentScores.find((student) => student.id === selectedStudentId) ?? null,
    [studentScores, selectedStudentId]
  );

  if (!isDemo && user?.role !== "professeur" && user?.role !== "admin" && user?.role !== "directeur") {
    return (
      <Card className="max-w-lg mx-auto mt-12 border-destructive/30">
        <CardContent className="p-8 text-center space-y-3">
          <ShieldAlert className="w-10 h-10 text-destructive mx-auto" />
          <h1 className="text-lg font-semibold">{t("principalClasses.accessDenied")}</h1>
          <p className="text-sm text-muted-foreground">{t("principalClasses.teacherOnly")}</p>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-6 animate-in fade-in duration-500">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight flex items-center gap-2">
            <Trophy className="w-6 h-6 text-amber-500" /> {t(isManagement ? "principalClasses.managementTitle" : "principalClasses.title")}
          </h1>
          <p className="text-sm text-muted-foreground mt-1">{t(isManagement ? "principalClasses.managementDescription" : "principalClasses.description")}</p>
        </div>
        <Button variant="outline" size="sm" className="gap-2 self-start" onClick={refetch} disabled={loading}>
          <RefreshCw className={cn("w-4 h-4", loading && "animate-spin")} /> {t("common.refresh")}
        </Button>
      </div>

      {error && (
        <Card className="border-destructive/30 bg-destructive/5">
          <CardContent className="p-4 text-sm text-destructive">{error}</CardContent>
        </Card>
      )}

      {loading && principalClasses.length === 0 ? (
        <div className="py-20 flex justify-center"><Loader2 className="w-8 h-8 animate-spin text-muted-foreground" /></div>
      ) : principalClasses.length === 0 ? (
        <Card className="border-dashed border-2">
          <CardContent className="p-12 text-center">
            <GraduationCap className="w-11 h-11 text-muted-foreground mx-auto mb-3" />
            <p className="font-semibold">{t("principalClasses.empty")}</p>
            <p className="text-sm text-muted-foreground mt-1">{t("principalClasses.emptyHint")}</p>
          </CardContent>
        </Card>
      ) : (
        <>
          <Card className="border-border/50">
            <CardContent className="p-4 flex flex-col sm:flex-row gap-3 sm:items-center sm:justify-between">
              <div className="flex items-center gap-2 text-sm font-medium">
                <GraduationCap className="w-4 h-4 text-primary" /> {t(isManagement ? "principalClasses.managementSelectClass" : "principalClasses.selectClass")}
              </div>
              <Select value={selectedClassId} onValueChange={setSelectedClassId}>
                <SelectTrigger className="w-full sm:w-72"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {principalClasses.map((classe) => <SelectItem key={classe.id} value={classe.id}>{classe.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </CardContent>
          </Card>

          {selectedClass && (
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <Users className="w-4 h-4" />
              {t("principalClasses.classStudentCount", { name: selectedClass.name, count: beltGroups.white.length + beltGroups.yellow.length + beltGroups.green.length + beltGroups.blue.length })}
            </div>
          )}

          {isManagement && recoveryRequests.length > 0 && (
            <Card className="border-amber-500/35 bg-amber-500/5">
              <CardHeader className="pb-3">
                <CardTitle className="flex items-center gap-2 text-base text-amber-700 dark:text-amber-300">
                  <ShieldAlert className="h-5 w-5" /> {t("skillRecovery.pendingRequestsTitle", { count: recoveryRequests.length })}
                </CardTitle>
                <CardDescription>{t("skillRecovery.pendingRequestsDescription")}</CardDescription>
              </CardHeader>
              <CardContent className="space-y-3">
                {recoveryRequests.map((request) => {
                  const student = studentScores.find((item) => item.id === request.studentId);
                  const skill = competencies.find((item) => item.id === request.competencyId);
                  return (
                    <div key={request.id} className="flex flex-col gap-3 rounded-lg border bg-background/70 p-3 lg:flex-row lg:items-center lg:justify-between">
                      <div className="min-w-0 space-y-1">
                        <p className="font-semibold">{student ? `${student.firstName} ${student.lastName}` : t("skillRecovery.unknownStudent")}</p>
                        <p className="text-sm text-muted-foreground">{skill?.code ?? "-"} - {skill?.title ?? "-"}</p>
                        <p className="text-xs text-muted-foreground">{t("skillRecovery.principalResetCount", { count: request.principalResetCount })}</p>
                        <p className="text-xs text-muted-foreground">{t("skillRecovery.requestReason", { reason: request.studentReason })}</p>
                      </div>
                      <Button
                        size="sm"
                        className="gap-2 self-start lg:self-auto"
                        disabled={!student}
                        onClick={() => {
                          if (!student) return;
                          setSelectedStudentId(student.id);
                          setRequestedCompetencyId(request.competencyId);
                          setRecoveryOpen(true);
                        }}
                      >
                        <CheckCircle2 className="h-4 w-4" /> {t("skillRecovery.reviewAndReset")}
                      </Button>
                    </div>
                  );
                })}
              </CardContent>
            </Card>
          )}

          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            {beltConfig.map(({ belt, dotClass, cardClass, scoreClass }) => {
              const students = beltGroups[belt];
              return (
                <Card key={belt} className={cn("min-h-64 border", cardClass)}>
                  <CardHeader className="pb-3">
                    <CardTitle className="text-base flex items-center gap-2">
                      <span className={cn("w-4 h-4 rounded-full shrink-0", dotClass)} />
                      {t(`principalClasses.${belt}`)}
                    </CardTitle>
                    <CardDescription>{t(`principalClasses.${belt}Range`)}</CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-2">
                    <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
                      {t("principalClasses.studentCount", { count: students.length })}
                    </p>
                    {students.length === 0 ? (
                      <p className="text-sm text-muted-foreground italic py-5 text-center">{t("principalClasses.noStudents")}</p>
                    ) : students.map((student) => (
                      <button
                        key={student.id}
                        type="button"
                        onClick={() => { setSelectedStudentId(student.id); setRequestedCompetencyId(undefined); setRecoveryOpen(true); }}
                        className="flex w-full items-center justify-between gap-2 rounded-lg bg-background/70 p-2.5 text-start hover:bg-background transition-colors"
                      >
                        <span className="text-sm font-medium truncate">{student.firstName} {student.lastName}</span>
                        <span className={cn("text-sm font-bold shrink-0", scoreClass)}>{student.score}%</span>
                      </button>
                    ))}
                  </CardContent>
                </Card>
              );
            })}
          </div>

          {selectedStudent && (
            <div className="space-y-3">
              <div className="flex flex-col gap-2 rounded-xl border bg-muted/30 p-4 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <p className="font-semibold">{selectedStudent.firstName} {selectedStudent.lastName}</p>
                  <p className="text-sm text-muted-foreground">{t("principalClasses.selectedStudentHint")}</p>
                </div>
                <Button onClick={() => { setRequestedCompetencyId(undefined); setRecoveryOpen(true); }}>{t("skillRecovery.open")}</Button>
              </div>
              <SkillHistoryChart studentId={selectedStudent.id} competencies={competencies} penalties={penalties} recoveries={recoveries} />
            </div>
          )}
        </>
      )}

      {selectedStudent && (
        <SkillRecoveryDialog
          open={recoveryOpen}
          onOpenChange={setRecoveryOpen}
          studentName={`${selectedStudent.firstName} ${selectedStudent.lastName}`}
          competencies={competencies}
          skills={selectedStudent.skills}
          initialCompetencyId={requestedCompetencyId}
          onSubmit={(submission) => createRecoveryAction(selectedStudent, submission)}
        />
      )}
    </div>
  );
}
