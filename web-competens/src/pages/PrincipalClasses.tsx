import { Link } from "react-router-dom";
import { GraduationCap, Loader2, RefreshCw, ShieldAlert, Trophy, Users } from "lucide-react";
import { useAuth } from "@/hooks/use-auth";
import { useDemoStore } from "@/stores/demo";
import { usePrincipalClasses, type Belt } from "@/hooks/use-principal-classes";
import { useI18n } from "@/i18n";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { cn } from "@/lib/utils";

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
    beltGroups, loading, error, refetch,
  } = usePrincipalClasses();

  if (!isDemo && user?.role !== "professeur") {
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
            <Trophy className="w-6 h-6 text-amber-500" /> {t("principalClasses.title")}
          </h1>
          <p className="text-sm text-muted-foreground mt-1">{t("principalClasses.description")}</p>
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
                <GraduationCap className="w-4 h-4 text-primary" /> {t("principalClasses.selectClass")}
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
                      <Link
                        key={student.id}
                        to={`/students/${student.id}`}
                        className="flex items-center justify-between gap-2 rounded-lg bg-background/70 p-2.5 hover:bg-background transition-colors"
                      >
                        <span className="text-sm font-medium truncate">{student.firstName} {student.lastName}</span>
                        <span className={cn("text-sm font-bold shrink-0", scoreClass)}>{student.score}%</span>
                      </Link>
                    ))}
                  </CardContent>
                </Card>
              );
            })}
          </div>
        </>
      )}
    </div>
  );
}
