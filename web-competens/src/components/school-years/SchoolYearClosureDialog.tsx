import { useEffect, useMemo, useState } from "react";
import {
  AlertTriangle,
  ArrowLeft,
  ArrowRight,
  CheckCircle2,
  GraduationCap,
  Loader2,
  Search,
  ShieldCheck,
  Users,
} from "lucide-react";
import { useSchoolYearClosure } from "@/hooks/use-school-year-closure";
import { useI18n } from "@/i18n";
import type { PromotionDecision, SchoolYear, SchoolYearClosureResult } from "@/types";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

interface Props {
  sourceYear: SchoolYear | null;
  schoolYears: SchoolYear[];
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onCompleted: () => Promise<void> | void;
}

const NEXT_LEVEL: Record<string, string> = {
  CP1: "CP2",
  CP2: "CE1",
  CE1: "CE2",
  CE2: "CM1",
  CM1: "CM2",
};

const DECISIONS: PromotionDecision[] = [
  "promote",
  "repeat",
  "graduate",
  "transfer",
  "withdraw",
];

export function SchoolYearClosureDialog({
  sourceYear,
  schoolYears,
  open,
  onOpenChange,
  onCompleted,
}: Props) {
  const { t } = useI18n();
  const closure = useSchoolYearClosure();
  const [step, setStep] = useState(1);
  const [selectedTargetYearId, setSelectedTargetYearId] = useState("");
  const [search, setSearch] = useState("");
  const [confirmed, setConfirmed] = useState(false);
  const [result, setResult] = useState<SchoolYearClosureResult | null>(null);

  const targetYears = useMemo(() => schoolYears
    .filter((year) => !year.isClosed && year.id !== sourceYear?.id && (!sourceYear || year.startDate > sourceYear.endDate))
    .sort((a, b) => a.startDate.localeCompare(b.startDate)), [schoolYears, sourceYear]);

  useEffect(() => {
    if (!open) return;
    closure.reset();
    setStep(1);
    setSearch("");
    setConfirmed(false);
    setResult(null);
    const futureYear = targetYears.find((year) => !sourceYear || year.startDate >= sourceYear.endDate)
      ?? targetYears[0];
    setSelectedTargetYearId(futureYear?.id ?? "");
  // Reset only when a new dialog session starts.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, sourceYear?.id]);

  const filteredRows = useMemo(() => {
    const query = search.trim().toLowerCase();
    if (!query) return closure.rows;
    return closure.rows.filter((row) =>
      `${row.firstName} ${row.lastName} ${row.sourceClassName}`.toLowerCase().includes(query),
    );
  }, [closure.rows, search]);

  const handlePrepare = async () => {
    if (!sourceYear || !selectedTargetYearId) return;
    try {
      await closure.prepare(sourceYear.id, selectedTargetYearId);
      setStep(2);
    } catch {
      // The hook exposes the translated/displayable error below.
    }
  };

  const handleFinalize = async () => {
    try {
      const finalResult = await closure.finalize();
      setResult(finalResult);
      setStep(4);
      await onCompleted();
    } catch {
      // The hook exposes the error below and keeps the review state intact.
    }
  };

  const handleDialogChange = (nextOpen: boolean) => {
    if (closure.saving) return;
    onOpenChange(nextOpen);
  };

  const directionIcon = step === 1 ? <ArrowRight className="h-4 w-4 rtl:rotate-180" /> : null;

  return (
    <Dialog open={open} onOpenChange={handleDialogChange}>
      <DialogContent className="max-w-6xl max-h-[94vh] overflow-hidden p-0 gap-0">
        <DialogHeader className="border-b px-6 py-5 pe-12">
          <DialogTitle className="flex items-center gap-2 text-xl">
            <GraduationCap className="h-5 w-5 text-primary" />
            {t("closure.title")}
          </DialogTitle>
          <DialogDescription>
            {sourceYear ? t("closure.subtitle", { year: sourceYear.name }) : t("closure.subtitleFallback")}
          </DialogDescription>
          {step < 4 && (
            <div className="flex items-center gap-2 pt-3" aria-label={t("closure.progress")}>
              {[1, 2, 3].map((item) => (
                <div key={item} className="flex flex-1 items-center gap-2">
                  <span className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-xs font-semibold ${
                    step >= item ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground"
                  }`}>
                    {step > item ? <CheckCircle2 className="h-4 w-4" /> : item}
                  </span>
                  <span className={`hidden text-xs sm:block ${step >= item ? "font-medium" : "text-muted-foreground"}`}>
                    {t(`closure.step${item}`)}
                  </span>
                  {item < 3 && <span className="h-px flex-1 bg-border" />}
                </div>
              ))}
            </div>
          )}
        </DialogHeader>

        <div className="overflow-y-auto px-6 py-5 max-h-[calc(94vh-180px)]">
          {closure.error && (
            <Alert variant="destructive" className="mb-4">
              <AlertTriangle className="h-4 w-4" />
              <AlertTitle>{t("common.error")}</AlertTitle>
              <AlertDescription>{closure.error}</AlertDescription>
            </Alert>
          )}

          {step === 1 && (
            <div className="mx-auto max-w-2xl space-y-5">
              <Alert>
                <ShieldCheck className="h-4 w-4" />
                <AlertTitle>{t("closure.irreversibleTitle")}</AlertTitle>
                <AlertDescription>{t("closure.irreversibleDesc")}</AlertDescription>
              </Alert>

              <div className="space-y-2">
                <Label>{t("closure.targetYear")}</Label>
                <Select value={selectedTargetYearId} onValueChange={setSelectedTargetYearId}>
                  <SelectTrigger>
                    <SelectValue placeholder={t("closure.selectTargetYear")} />
                  </SelectTrigger>
                  <SelectContent>
                    {targetYears.map((year) => (
                      <SelectItem key={year.id} value={year.id}>{year.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {targetYears.length === 0 && (
                  <p className="text-sm text-destructive">{t("closure.noTargetYear")}</p>
                )}
              </div>

              <Card className="bg-muted/30">
                <CardContent className="space-y-2 p-4 text-sm text-muted-foreground">
                  <p>• {t("closure.classStructureInfo")}</p>
                  <p>• {t("closure.assignmentInfo")}</p>
                  <p>• {t("closure.parentInfo")}</p>
                </CardContent>
              </Card>
            </div>
          )}

          {step === 2 && (
            <div className="space-y-4">
              <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <h3 className="font-semibold">{t("closure.reviewTitle")}</h3>
                  <p className="text-sm text-muted-foreground">
                    {t("closure.reviewDesc", { count: closure.rows.length })}
                  </p>
                </div>
                <div className="relative sm:w-72">
                  <Search className="absolute start-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                  <Input
                    value={search}
                    onChange={(event) => setSearch(event.target.value)}
                    placeholder={t("closure.searchStudent")}
                    className="ps-9"
                  />
                </div>
              </div>

              <ScrollArea className="h-[52vh] pe-3">
                <div className="space-y-2">
                  {filteredRows.map((row) => {
                    const expectedLevel = row.decision === "repeat"
                      ? row.sourceLevelCode
                      : NEXT_LEVEL[row.sourceLevelCode];
                    const availableClasses = closure.targetClasses.filter(
                      (classe) => classe.levelCode === expectedLevel,
                    );
                    const needsTarget = row.decision === "promote" || row.decision === "repeat";
                    return (
                      <Card key={row.studentId}>
                        <CardContent className="grid gap-3 p-3 md:grid-cols-[minmax(180px,1.2fr)_minmax(150px,0.9fr)_minmax(170px,1fr)_minmax(180px,1.1fr)] md:items-end">
                          <div className="min-w-0">
                            <p className="truncate font-medium">{row.firstName} {row.lastName}</p>
                            <div className="mt-1 flex gap-1.5">
                              <Badge variant="outline">{row.sourceClassName}</Badge>
                              <Badge variant="secondary">{row.sourceLevelCode}</Badge>
                            </div>
                          </div>
                          <div className="space-y-1.5">
                            <Label className="text-xs">{t("closure.decision")}</Label>
                            <Select
                              value={row.decision}
                              onValueChange={(value) => closure.updateDecision(row.studentId, value as PromotionDecision)}
                            >
                              <SelectTrigger><SelectValue /></SelectTrigger>
                              <SelectContent>
                                {DECISIONS
                                  .filter((decision) => !(decision === "promote" && row.sourceLevelCode === "CM2"))
                                  .filter((decision) => decision !== "graduate" || row.sourceLevelCode === "CM2")
                                  .map((decision) => (
                                    <SelectItem key={decision} value={decision}>
                                      {t(`closure.decision.${decision}`)}
                                    </SelectItem>
                                  ))}
                              </SelectContent>
                            </Select>
                          </div>
                          <div className="space-y-1.5">
                            <Label className="text-xs">{t("closure.targetClass")}</Label>
                            <Select
                              value={row.targetClassId ?? ""}
                              onValueChange={(value) => closure.updateTargetClass(row.studentId, value)}
                              disabled={!needsTarget || availableClasses.length === 0}
                            >
                              <SelectTrigger>
                                <SelectValue placeholder={needsTarget ? t("closure.selectClass") : t("closure.notApplicable")} />
                              </SelectTrigger>
                              <SelectContent>
                                {availableClasses.map((classe) => (
                                  <SelectItem key={classe.id} value={classe.id}>
                                    {classe.name} ({classe.studentCount}/{classe.capacity})
                                  </SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                          </div>
                          <div className="space-y-1.5">
                            <Label className="text-xs">{t("closure.notes")}</Label>
                            <Input
                              value={row.notes ?? ""}
                              onChange={(event) => closure.updateNotes(row.studentId, event.target.value)}
                              placeholder={t("common.optionalCap")}
                            />
                          </div>
                        </CardContent>
                      </Card>
                    );
                  })}
                </div>
              </ScrollArea>
            </div>
          )}

          {step === 3 && (
            <div className="space-y-5">
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
                {([
                  ["promoted", closure.preview.promoted],
                  ["repeated", closure.preview.repeated],
                  ["graduated", closure.preview.graduated],
                  ["transferred", closure.preview.transferred],
                  ["withdrawn", closure.preview.withdrawn],
                  ["total", closure.preview.total],
                ] as const).map(([key, value]) => (
                  <Card key={key}>
                    <CardContent className="p-4 text-center">
                      <p className="text-2xl font-bold">{value}</p>
                      <p className="mt-1 text-xs text-muted-foreground">{t(`closure.summary.${key}`)}</p>
                    </CardContent>
                  </Card>
                ))}
              </div>

              {closure.preview.errors.length > 0 ? (
                <Alert variant="destructive">
                  <AlertTriangle className="h-4 w-4" />
                  <AlertTitle>{t("closure.validationTitle")}</AlertTitle>
                  <AlertDescription>
                    <ul className="mt-2 list-disc space-y-1 ps-5">
                      {closure.preview.errors.slice(0, 12).map((validationError, index) => (
                        <li key={`${validationError}-${index}`}>{validationError}</li>
                      ))}
                    </ul>
                  </AlertDescription>
                </Alert>
              ) : (
                <Alert className="border-emerald-500/30 bg-emerald-500/5">
                  <CheckCircle2 className="h-4 w-4 text-emerald-600" />
                  <AlertTitle>{t("closure.readyTitle")}</AlertTitle>
                  <AlertDescription>{t("closure.readyDesc")}</AlertDescription>
                </Alert>
              )}

              <label className="flex cursor-pointer items-start gap-3 rounded-lg border p-4">
                <Checkbox
                  checked={confirmed}
                  onCheckedChange={(checked) => setConfirmed(checked === true)}
                  className="mt-0.5"
                />
                <span className="text-sm leading-relaxed">{t("closure.confirmText")}</span>
              </label>
            </div>
          )}

          {step === 4 && result && (
            <div className="mx-auto max-w-2xl py-8 text-center">
              <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-emerald-500/10">
                <CheckCircle2 className="h-9 w-9 text-emerald-600" />
              </div>
              <h3 className="mt-4 text-xl font-bold">{t("closure.successTitle")}</h3>
              <p className="mt-2 text-muted-foreground">{t("closure.successDesc")}</p>
              <div className="mt-6 grid grid-cols-2 gap-3 sm:grid-cols-3">
                <SummaryItem icon={<Users className="h-4 w-4" />} label={t("closure.summary.promoted")} value={result.promoted} />
                <SummaryItem icon={<ArrowLeft className="h-4 w-4 rtl:rotate-180" />} label={t("closure.summary.repeated")} value={result.repeated} />
                <SummaryItem icon={<GraduationCap className="h-4 w-4" />} label={t("closure.summary.graduated")} value={result.graduated} />
              </div>
            </div>
          )}
        </div>

        <DialogFooter className="border-t px-6 py-4 sm:space-x-0 sm:gap-2">
          {step === 1 && (
            <Button onClick={handlePrepare} disabled={!selectedTargetYearId || closure.loading}>
              {closure.loading ? <Loader2 className="me-2 h-4 w-4 animate-spin" /> : directionIcon}
              <span className="ms-2">{t("closure.prepare")}</span>
            </Button>
          )}
          {step === 2 && (
            <>
              <Button variant="outline" onClick={() => setStep(1)}>
                <ArrowLeft className="me-2 h-4 w-4 rtl:rotate-180" /> {t("common.back")}
              </Button>
              <Button onClick={() => setStep(3)}>
                {t("closure.preview")} <ArrowRight className="ms-2 h-4 w-4 rtl:rotate-180" />
              </Button>
            </>
          )}
          {step === 3 && (
            <>
              <Button variant="outline" onClick={() => setStep(2)} disabled={closure.saving}>
                <ArrowLeft className="me-2 h-4 w-4 rtl:rotate-180" /> {t("common.back")}
              </Button>
              <Button
                variant="destructive"
                onClick={handleFinalize}
                disabled={!confirmed || closure.preview.errors.length > 0 || closure.saving}
              >
                {closure.saving && <Loader2 className="me-2 h-4 w-4 animate-spin" />}
                {t("closure.finalize")}
              </Button>
            </>
          )}
          {step === 4 && (
            <Button onClick={() => onOpenChange(false)}>{t("common.close")}</Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function SummaryItem({ icon, label, value }: { icon: React.ReactNode; label: string; value: number }) {
  return (
    <div className="rounded-lg border p-3">
      <div className="flex items-center justify-center gap-2 text-muted-foreground">{icon}<span className="text-xs">{label}</span></div>
      <p className="mt-1 text-xl font-bold">{value}</p>
    </div>
  );
}
