import { useState, useMemo, useEffect } from "react";
import { useEvaluation } from "@/hooks/use-evaluation";
import { useI18n } from "@/i18n";
import { localizeCompTitle } from "@/i18n/competency-content";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ClipboardCheck, CheckCircle, MinusCircle, Save, Loader2, AlertCircle } from "lucide-react";
import { cn } from "@/lib/utils";
import type { EvaluationStatus, DailyEvaluationInput } from "@/types";

type EvalState = Record<string, EvaluationStatus>;

/** On this screen a student is either at 100% (untouched / "acquis") or has
 *  a "-1" penalty applied. Any status other than "acquis" is shown as the
 *  penalty state — this also lets a pre-existing "en_cours" record (saved
 *  before this screen existed) render correctly as a penalty. */
function isPenalized(status: EvaluationStatus | undefined): boolean {
  return status !== undefined && status !== "acquis";
}

export default function EvaluationPage() {
  const { t, lang } = useI18n();
  const locale = lang === "ar" ? "ar-MA" : "fr-FR";
  const {
    classes, levels, competencies,
    loading, error,
    getStudentsForClass, getTodayEvals, saveDailyEvaluation,
  } = useEvaluation();

  const [classId, setClassId] = useState("");
  const [competencyId, setCompetencyId] = useState("");
  const [evalStates, setEvalStates] = useState<EvalState>({});
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState("");
  const [saveSuccess, setSaveSuccess] = useState(false);

  const selectedClass = useMemo(() => classes.find((c) => c.id === classId), [classes, classId]);
  const selectedCompetency = useMemo(() => competencies.find((c) => c.id === competencyId), [competencies, competencyId]);
  const classStudents = useMemo(() => getStudentsForClass(classId), [getStudentsForClass, classId]);
  const todayEvals = useMemo(() => getTodayEvals(classId, competencyId), [getTodayEvals, classId, competencyId]);

  useEffect(() => {
    if (classId && competencyId) {
      setEvalStates((prev) => ({ ...prev, ...todayEvals }));
    }
  }, [todayEvals, classId, competencyId]);

  const handleClassSelect = (id: string) => {
    setClassId(id);
    setCompetencyId("");
    setEvalStates({});
    setSaveError("");
    setSaveSuccess(false);
  };

  const handleCompetencySelect = (id: string) => {
    setCompetencyId(id);
    setEvalStates({});
    setSaveError("");
    setSaveSuccess(false);
  };

  const togglePenalty = (studentId: string) => {
    setEvalStates((prev) => {
      const original = todayEvals[studentId];
      const current = prev[studentId] ?? original;
      const next = { ...prev };
      if (isPenalized(current)) {
        // Undo → back to 100%
        if (isPenalized(original)) {
          // A penalty was already persisted today — must explicitly overwrite it on save.
          next[studentId] = "acquis";
        } else {
          // Nothing persisted yet — just drop the pending edit, nothing to save.
          delete next[studentId];
        }
      } else {
        next[studentId] = "non_acquis";
      }
      return next;
    });
  };

  const handleSave = async () => {
    if (!classId || !competencyId) return;
    setSaveError("");
    setSaveSuccess(false);
    setSaving(true);
    try {
      const input: DailyEvaluationInput[] = Object.entries(evalStates).map(([studentId, status]) => ({
        studentId,
        competencyId,
        status,
      }));
      await saveDailyEvaluation(classId, competencyId, input);
      setEvalStates({});
      setSaveSuccess(true);
      setTimeout(() => setSaveSuccess(false), 3000);
    } catch (e: unknown) {
      setSaveError(e instanceof Error ? e.message : t("common.saveError"));
    } finally {
      setSaving(false);
    }
  };

  const editedCount = Object.keys(evalStates).length;

  return (
    <div className="space-y-6 animate-in fade-in duration-500">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">{t("evaluation.title")}</h1>
          <p className="text-sm text-muted-foreground">{t("evaluation.subtitle")}</p>
        </div>
        <Badge variant="outline" className="text-sm">
          {new Date().toLocaleDateString(locale, { weekday: "long", day: "numeric", month: "long" })}
        </Badge>
      </div>

      {error && (
        <div className="flex items-center gap-2 p-3 rounded-lg bg-destructive/10 text-destructive text-sm">
          <AlertCircle className="w-4 h-4 shrink-0" /> {error}
        </div>
      )}

      {loading ? (
        <div className="flex items-center justify-center py-20">
          <Loader2 className="w-8 h-8 animate-spin text-muted-foreground" />
        </div>
      ) : (
        <>
          {/* Step 1: Select Class */}
          <Card className="border-border/50">
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-semibold flex items-center gap-2">
                <span className="w-6 h-6 rounded-full bg-primary text-primary-foreground flex items-center justify-center text-xs font-bold">1</span>
                {t("evaluation.step1")}
              </CardTitle>
            </CardHeader>
            <CardContent>
              {classes.length === 0 ? (
                <p className="text-sm text-muted-foreground">{t("evaluation.noClass")}</p>
              ) : (
                <div className="flex flex-wrap gap-2">
                  {classes.map((c) => {
                    const level = levels.find((l) => l.id === c.levelId);
                    return (
                      <Button
                        key={c.id}
                        variant={c.id === classId ? "default" : "outline"}
                        size="sm"
                        onClick={() => handleClassSelect(c.id)}
                        className="gap-2"
                      >
                        {c.name}
                        {level && <Badge variant="secondary" className="ms-1 text-[10px]">{level.code}</Badge>}
                      </Button>
                    );
                  })}
                </div>
              )}
            </CardContent>
          </Card>

          {/* Step 2: Select Competency */}
          {classId && (
            <Card className="border-border/50 animate-in fade-in slide-in-from-top-2 duration-300">
              <CardHeader className="pb-3">
                <CardTitle className="text-sm font-semibold flex items-center gap-2">
                  <span className="w-6 h-6 rounded-full bg-primary text-primary-foreground flex items-center justify-center text-xs font-bold">2</span>
                  {t("evaluation.step2")}
                </CardTitle>
              </CardHeader>
              <CardContent>
                {competencies.length === 0 ? (
                  <p className="text-sm text-muted-foreground">{t("evaluation.noCompetency")}</p>
                ) : (
                  <div className="flex flex-wrap gap-2">
                    {competencies.map((c) => (
                      <Button
                        key={c.id}
                        variant={c.id === competencyId ? "default" : "outline"}
                        size="sm"
                        onClick={() => handleCompetencySelect(c.id)}
                        className="gap-2"
                      >
                        <span className="font-mono font-bold">{c.code}</span>
                        <span className="hidden sm:inline truncate max-w-[160px]">{localizeCompTitle(c.code, c.title, lang)}</span>
                      </Button>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          )}

          {/* Step 3: Evaluation Grid */}
          {classId && competencyId && (
            <Card className="border-border/50 animate-in fade-in slide-in-from-top-2 duration-300">
              <CardHeader className="pb-1">
                <div className="flex items-center justify-between">
                  <CardTitle className="text-base font-semibold flex items-center gap-2">
                    <ClipboardCheck className="w-5 h-5 text-primary" />
                    {selectedClass?.name} — {selectedCompetency?.code}
                  </CardTitle>
                  <Badge variant="secondary" className="font-mono">{t("evaluation.studentsCount", { count: classStudents.length })}</Badge>
                </div>
              </CardHeader>
              <CardContent>
                {/* Legend */}
                <div className="flex flex-wrap items-center gap-4 mb-2 text-xs">
                  <div className="flex items-center gap-1.5 text-muted-foreground">
                    <CheckCircle className="w-4 h-4 text-green-600" />
                    <span className="font-bold text-green-600">100%</span> — {t("evaluation.legendAcquired")}
                  </div>
                  <div className="flex items-center gap-1.5 text-muted-foreground">
                    <MinusCircle className="w-4 h-4 text-amber-600" />
                    <span className="font-bold text-amber-600">-1</span> — {t("evaluation.legendPenalty")}
                  </div>
                </div>
                <p className="text-[11px] text-muted-foreground mb-4">{t("evaluation.clickHint")}</p>

                {/* Student List */}
                {classStudents.length === 0 ? (
                  <p className="text-center text-muted-foreground py-8">
                    {t("evaluation.noStudents")}
                  </p>
                ) : (
                  <div className="grid gap-2">
                    {classStudents.map((s, idx) => {
                      const current = evalStates[s.id] ?? todayEvals[s.id];
                      const penalized = isPenalized(current);
                      return (
                        <button
                          key={s.id}
                          onClick={() => togglePenalty(s.id)}
                          className={cn(
                            "flex items-center gap-3 p-3 rounded-xl border-2 transition-all duration-200 text-start w-full",
                            penalized ? "bg-amber-500/10 border-amber-500/30" : "bg-green-500/10 border-green-500/30",
                            s.id in evalStates ? "border-current" : "border-transparent hover:border-muted-foreground/20"
                          )}
                        >
                          <span className="w-7 h-7 rounded-lg bg-muted flex items-center justify-center text-xs font-mono font-bold text-muted-foreground shrink-0">
                            {idx + 1}
                          </span>
                          <div className="flex-1 min-w-0">
                            <p className="text-sm font-medium text-foreground truncate">
                              {s.firstName} {s.lastName}
                            </p>
                          </div>
                          {penalized
                            ? <MinusCircle className="w-5 h-5 shrink-0 text-amber-600" />
                            : <CheckCircle className="w-5 h-5 shrink-0 text-green-600" />}
                          <span className={cn("text-sm font-bold shrink-0 tabular-nums", penalized ? "text-amber-600" : "text-green-600")}>
                            {penalized ? "-1" : "100%"}
                          </span>
                        </button>
                      );
                    })}
                  </div>
                )}

                {saveError && (
                  <div className="mt-4 flex items-center gap-2 p-3 rounded-lg bg-destructive/10 text-destructive text-sm">
                    <AlertCircle className="w-4 h-4 shrink-0" /> {saveError}
                  </div>
                )}

                {saveSuccess && (
                  <div className="mt-4 flex items-center gap-2 p-3 rounded-lg bg-green-500/10 text-green-700 text-sm">
                    <CheckCircle className="w-4 h-4 shrink-0" /> {t("evaluation.saved")}
                  </div>
                )}

                {/* Save Button */}
                <div className="mt-6 flex justify-end">
                  <Button
                    size="lg"
                    onClick={handleSave}
                    disabled={saving || editedCount === 0}
                    className="gap-2 px-8"
                  >
                    {saving ? <Loader2 className="w-5 h-5 animate-spin" /> : <Save className="w-5 h-5" />}
                    {saving ? t("evaluation.saving") : `${t("evaluation.saveBtn")}${editedCount > 0 ? ` (${editedCount})` : ""}`}
                  </Button>
                </div>
              </CardContent>
            </Card>
          )}
        </>
      )}
    </div>
  );
}
