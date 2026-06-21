import { useState, useMemo, useEffect } from "react";
import { useEvaluation } from "@/hooks/use-evaluation";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ClipboardCheck, CheckCircle, Clock, XCircle, Save, Loader2, AlertCircle } from "lucide-react";
import { cn } from "@/lib/utils";
import type { EvaluationStatus, DailyEvaluationInput } from "@/types";

type EvalState = Record<string, EvaluationStatus>;

export default function EvaluationPage() {
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

  const toggleStatus = (studentId: string) => {
    setEvalStates((prev) => {
      const current = prev[studentId] ?? todayEvals[studentId] ?? "non_acquis";
      const next: EvaluationStatus =
        current === "non_acquis" ? "en_cours" : current === "en_cours" ? "acquis" : "non_acquis";
      return { ...prev, [studentId]: next };
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
      setSaveError(e instanceof Error ? e.message : "Erreur lors de l'enregistrement");
    } finally {
      setSaving(false);
    }
  };

  const statusConfig: Record<EvaluationStatus, { icon: typeof CheckCircle; label: string; color: string; bg: string }> = {
    acquis:     { icon: CheckCircle, label: "Acquis",     color: "text-green-600", bg: "bg-green-500/10 border-green-500/30" },
    en_cours:   { icon: Clock,       label: "En cours",   color: "text-amber-600", bg: "bg-amber-500/10 border-amber-500/30" },
    non_acquis: { icon: XCircle,     label: "Non acquis", color: "text-red-600",   bg: "bg-red-500/10 border-red-500/30" },
  };

  const editedCount = Object.keys(evalStates).length;

  return (
    <div className="space-y-6 animate-in fade-in duration-500">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Évaluation quotidienne</h1>
          <p className="text-sm text-muted-foreground">Évaluez les compétences de vos élèves</p>
        </div>
        <Badge variant="outline" className="text-sm">
          {new Date().toLocaleDateString("fr-FR", { weekday: "long", day: "numeric", month: "long" })}
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
                Choisir une classe
              </CardTitle>
            </CardHeader>
            <CardContent>
              {classes.length === 0 ? (
                <p className="text-sm text-muted-foreground">Aucune classe disponible — créez des classes ou vérifiez vos attributions.</p>
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
                        {level && <Badge variant="secondary" className="ml-1 text-[10px]">{level.code}</Badge>}
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
                  Choisir une compétence
                </CardTitle>
              </CardHeader>
              <CardContent>
                {competencies.length === 0 ? (
                  <p className="text-sm text-muted-foreground">Aucune compétence — ajoutez-en dans la section Compétences.</p>
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
                        <span className="hidden sm:inline truncate max-w-[160px]">{c.title}</span>
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
                  <Badge variant="secondary" className="font-mono">{classStudents.length} élèves</Badge>
                </div>
              </CardHeader>
              <CardContent>
                {/* Legend */}
                <div className="flex gap-4 mb-4 text-xs">
                  {(["acquis", "en_cours", "non_acquis"] as EvaluationStatus[]).map((s) => {
                    const cfg = statusConfig[s];
                    const Icon = cfg.icon;
                    return (
                      <div key={s} className="flex items-center gap-1.5 text-muted-foreground">
                        <Icon className={cn("w-4 h-4", cfg.color)} /> {cfg.label}
                      </div>
                    );
                  })}
                </div>

                {/* Student List */}
                {classStudents.length === 0 ? (
                  <p className="text-center text-muted-foreground py-8">
                    Aucun élève dans cette classe — ajoutez des élèves d'abord.
                  </p>
                ) : (
                  <div className="grid gap-2">
                    {classStudents.map((s, idx) => {
                      const status = evalStates[s.id] ?? todayEvals[s.id] ?? "non_acquis";
                      const cfg = statusConfig[status];
                      const Icon = cfg.icon;
                      return (
                        <button
                          key={s.id}
                          onClick={() => toggleStatus(s.id)}
                          className={cn(
                            "flex items-center gap-3 p-3 rounded-xl border-2 transition-all duration-200 text-left w-full",
                            cfg.bg,
                            evalStates[s.id] ? "border-current" : "border-transparent hover:border-muted-foreground/20"
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
                          <Icon className={cn("w-5 h-5 shrink-0", cfg.color)} />
                          <span className={cn("text-xs font-medium shrink-0", cfg.color)}>{cfg.label}</span>
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
                    <CheckCircle className="w-4 h-4 shrink-0" /> Évaluations enregistrées avec succès
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
                    {saving ? "Enregistrement…" : `Enregistrer${editedCount > 0 ? ` (${editedCount})` : ""}`}
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
