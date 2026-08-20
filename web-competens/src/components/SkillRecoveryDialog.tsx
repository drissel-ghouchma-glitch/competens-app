import { useEffect, useMemo, useState } from "react";
import { RotateCcw, TrendingUp } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { useI18n } from "@/i18n";
import type { Competency, SkillRecoveryActionType } from "@/types";

export interface RecoverySkill {
  competencyId: string;
  competencyCode: string;
  competencyTitle: string;
  acquisitionRate: number;
  totalEvaluations: number;
  isArchived?: boolean;
}

export interface RecoverySubmission {
  competencyId: string;
  actionType: SkillRecoveryActionType;
  newScore: number;
  meetingDate: string;
  studentReason: string;
  meetingNotes: string;
}

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  studentName: string;
  competencies: Competency[];
  skills: RecoverySkill[];
  onSubmit: (submission: RecoverySubmission) => Promise<void>;
}

export function SkillRecoveryDialog({ open, onOpenChange, studentName, competencies, skills, onSubmit }: Props) {
  const { t } = useI18n();
  const candidates = useMemo(() => skills.filter((skill) => !skill.isArchived && skill.acquisitionRate < 99), [skills]);
  const [competencyId, setCompetencyId] = useState("");
  const [actionType, setActionType] = useState<SkillRecoveryActionType>("increase");
  const [newScore, setNewScore] = useState("");
  const [meetingDate, setMeetingDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [studentReason, setStudentReason] = useState("");
  const [meetingNotes, setMeetingNotes] = useState("");
  const [confirmedReset, setConfirmedReset] = useState(false);
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    setCompetencyId(candidates[0]?.competencyId ?? "");
    setActionType("increase");
    setNewScore("");
    setMeetingDate(new Date().toISOString().slice(0, 10));
    setStudentReason("");
    setMeetingNotes("");
    setConfirmedReset(false);
    setFormError(null);
  }, [open, candidates]);

  const selected = candidates.find((skill) => skill.competencyId === competencyId);
  const selectedCompetency = competencies.find((competency) => competency.id === competencyId);

  const submit = async () => {
    const nextScore = actionType === "reset_to_100" ? 100 : Number(newScore);
    if (!selected || !Number.isInteger(nextScore) || nextScore <= selected.acquisitionRate || nextScore > 100 || nextScore < 0) {
      setFormError(t("skillRecovery.invalidScore"));
      return;
    }
    if (!meetingDate || !studentReason.trim() || !meetingNotes.trim()) {
      setFormError(t("skillRecovery.requiredFields"));
      return;
    }
    if (actionType === "reset_to_100" && !confirmedReset) {
      setFormError(t("skillRecovery.confirmResetRequired"));
      return;
    }
    setSaving(true);
    setFormError(null);
    try {
      await onSubmit({ competencyId, actionType, newScore: nextScore, meetingDate, studentReason: studentReason.trim(), meetingNotes: meetingNotes.trim() });
      onOpenChange(false);
    } catch (error: unknown) {
      setFormError(error instanceof Error ? error.message : t("common.saveError"));
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] max-w-xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{t("skillRecovery.title")}</DialogTitle>
          <DialogDescription>{t("skillRecovery.description", { name: studentName })}</DialogDescription>
        </DialogHeader>

        {candidates.length === 0 ? (
          <p className="rounded-lg bg-muted p-4 text-sm text-muted-foreground">{t("skillRecovery.noEligibleSkill")}</p>
        ) : (
          <div className="space-y-4">
            <div className="space-y-1.5">
              <Label>{t("skillRecovery.skill")}</Label>
              <Select value={competencyId} onValueChange={setCompetencyId}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {candidates.map((skill) => <SelectItem key={skill.competencyId} value={skill.competencyId}>{skill.competencyCode} — {skill.competencyTitle} ({skill.acquisitionRate}%)</SelectItem>)}
                </SelectContent>
              </Select>
              {selected && <p className="text-xs text-muted-foreground">{t("skillRecovery.currentScore", { score: selected.acquisitionRate, count: selected.totalEvaluations })}</p>}
              {selectedCompetency?.description && <p className="text-xs text-muted-foreground">{selectedCompetency.description}</p>}
            </div>

            <div className="grid gap-2 sm:grid-cols-2">
              <Button type="button" variant={actionType === "increase" ? "default" : "outline"} onClick={() => { setActionType("increase"); setConfirmedReset(false); }} className="gap-2">
                <TrendingUp className="h-4 w-4" /> {t("skillRecovery.increase")}
              </Button>
              <Button type="button" variant={actionType === "reset_to_100" ? "default" : "outline"} onClick={() => setActionType("reset_to_100")} className="gap-2">
                <RotateCcw className="h-4 w-4" /> {t("skillRecovery.resetTo100")}
              </Button>
            </div>

            {actionType === "increase" ? (
              <div className="space-y-1.5">
                <Label>{t("skillRecovery.newScore")}</Label>
                <Input type="number" min={(selected?.acquisitionRate ?? 0) + 1} max="100" value={newScore} onChange={(event) => setNewScore(event.target.value)} />
              </div>
            ) : (
              <label className="flex items-start gap-2 rounded-lg border border-blue-500/30 bg-blue-500/5 p-3 text-sm">
                <Checkbox checked={confirmedReset} onCheckedChange={(value) => setConfirmedReset(value === true)} />
                <span>{t("skillRecovery.confirmReset")}</span>
              </label>
            )}

            <div className="space-y-1.5">
              <Label>{t("skillRecovery.meetingDate")}</Label>
              <Input type="date" value={meetingDate} onChange={(event) => setMeetingDate(event.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label>{t("skillRecovery.studentReason")}</Label>
              <Textarea value={studentReason} onChange={(event) => setStudentReason(event.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label>{t("skillRecovery.meetingNotes")}</Label>
              <Textarea value={meetingNotes} onChange={(event) => setMeetingNotes(event.target.value)} />
            </div>
            {formError && <p className="text-sm text-destructive">{formError}</p>}
          </div>
        )}

        <DialogFooter>
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={saving}>{t("common.cancel")}</Button>
          <Button type="button" onClick={submit} disabled={saving || candidates.length === 0}>{saving ? t("common.loading") : t("skillRecovery.save")}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
