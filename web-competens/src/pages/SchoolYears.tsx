import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useSchoolYears } from "@/hooks/use-school-years";
import { useI18n } from "@/i18n";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Archive, Calendar, Plus, CheckCircle, Clock, Edit, Loader2 } from "lucide-react";
import {
  Dialog, DialogContent, DialogDescription,
  DialogHeader, DialogTitle, DialogTrigger,
} from "@/components/ui/dialog";
import type { SchoolYear } from "@/types";
import { SchoolYearClosureDialog } from "@/components/school-years/SchoolYearClosureDialog";

export default function SchoolYearsPage() {
  const navigate = useNavigate();
  const { schoolYears, loading, error, refetch, addSchoolYear, updateSchoolYear, toggleSchoolYearActive } = useSchoolYears();
  const { t, lang } = useI18n();
  const locale = lang === "ar" ? "ar-MA" : "fr-FR";

  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [editId, setEditId] = useState<string | null>(null);
  const [name, setName] = useState("");
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [closureYear, setClosureYear] = useState<SchoolYear | null>(null);

  const handleSubmit = async () => {
    setSaving(true);
    setSaveError(null);
    try {
      if (editId) {
        await updateSchoolYear(editId, { name, startDate, endDate });
      } else {
        await addSchoolYear({ name, startDate, endDate, isActive: schoolYears.length === 0, isClosed: false });
      }
      resetForm();
    } catch (e: unknown) {
      setSaveError(e instanceof Error ? e.message : t("common.saveError"));
    } finally {
      setSaving(false);
    }
  };

  const handleEdit = (sy: SchoolYear) => {
    setEditId(sy.id);
    setName(sy.name);
    setStartDate(sy.startDate);
    setEndDate(sy.endDate);
    setOpen(true);
  };

  const resetForm = () => {
    setOpen(false);
    setEditId(null);
    setName("");
    setStartDate("");
    setEndDate("");
    setSaveError(null);
  };

  return (
    <div className="space-y-6 animate-in fade-in duration-500">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">{t("schoolYears.title")}</h1>
          <p className="text-sm text-muted-foreground">{t("schoolYears.subtitle")}</p>
        </div>
        <Dialog open={open} onOpenChange={(o) => { setOpen(o); if (!o) resetForm(); }}>
          <DialogTrigger asChild>
            <Button size="sm" className="gap-2">
              <Plus className="w-4 h-4" /> {t("schoolYears.newYear")}
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>{editId ? t("schoolYears.editTitle") : t("schoolYears.createTitle")}</DialogTitle>
              <DialogDescription>{t("schoolYears.formDesc")}</DialogDescription>
            </DialogHeader>
            <div className="space-y-4 pt-2">
              <div className="space-y-2">
                <Label>{t("schoolYears.name")}</Label>
                <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="2025-2026" />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-2">
                  <Label>{t("schoolYears.startDate")}</Label>
                  <Input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} />
                </div>
                <div className="space-y-2">
                  <Label>{t("schoolYears.endDate")}</Label>
                  <Input type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} />
                </div>
              </div>
              {saveError && <p className="text-sm text-destructive">{saveError}</p>}
              <Button onClick={handleSubmit} className="w-full" disabled={!name || saving}>
                {saving ? <Loader2 className="w-4 h-4 animate-spin me-2" /> : null}
                {editId ? t("common.save") : t("schoolYears.createBtn")}
              </Button>
            </div>
          </DialogContent>
        </Dialog>
      </div>

      {error && (
        <div className="rounded-lg border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive">
          {error}
        </div>
      )}

      {loading ? (
        <div className="flex items-center justify-center py-12">
          <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
        </div>
      ) : (
        <div className="grid gap-3">
          {schoolYears.map((sy) => (
            <Card key={sy.id} className={`border-border/50 transition-all ${sy.isActive ? "ring-2 ring-primary/30" : ""}`}>
              <CardContent className="p-4 md:p-5 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
                <div className="flex items-start gap-3">
                  <div className={`w-10 h-10 rounded-xl flex items-center justify-center ${sy.isClosed ? "bg-muted" : sy.isActive ? "bg-primary/10" : "bg-muted/50"}`}>
                    <Calendar className={`w-5 h-5 ${sy.isActive ? "text-primary" : "text-muted-foreground"}`} />
                  </div>
                  <div>
                    <div className="flex items-center gap-2 flex-wrap">
                      <h3 className="font-semibold text-foreground">{sy.name}</h3>
                      {sy.isClosed && <Badge variant="secondary">{t("schoolYears.closed")}</Badge>}
                      {sy.isActive && (
                        <Badge className="bg-green-500/10 text-green-600 border-green-500/20 flex items-center gap-1">
                          <CheckCircle className="w-3 h-3" /> {t("schoolYears.active")}
                        </Badge>
                      )}
                    </div>
                    <p className="text-sm text-muted-foreground mt-0.5">
                      {t("schoolYears.period", {
                        start: new Date(sy.startDate).toLocaleDateString(locale),
                        end: new Date(sy.endDate).toLocaleDateString(locale),
                      })}
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-2 self-end sm:self-auto">
                  {sy.isClosed && (
                    <Button variant="outline" size="sm" onClick={() => navigate(`/school-years/${sy.id}/archive`)}>
                      <Archive className="w-3.5 h-3.5 me-1.5" /> {t("schoolYears.viewArchive")}
                    </Button>
                  )}
                  <Button variant="outline" size="sm" onClick={() => handleEdit(sy)} disabled={sy.isClosed}>
                    <Edit className="w-3.5 h-3.5" />
                  </Button>
                  {!sy.isClosed && !sy.isActive && !schoolYears.some((year) => year.isActive) && (
                    <Button variant="outline" size="sm" onClick={() => toggleSchoolYearActive(sy.id)}>
                      {t("schoolYears.activate")}
                    </Button>
                  )}
                  {sy.isActive && (
                    <Button variant="outline" size="sm" onClick={() => setClosureYear(sy)} className="text-destructive border-destructive/30 hover:bg-destructive/5">
                      <Clock className="w-3.5 h-3.5 me-1.5" /> {t("schoolYears.close")}
                    </Button>
                  )}
                </div>
              </CardContent>
            </Card>
          ))}
          {schoolYears.length === 0 && (
            <Card className="border-dashed border-2">
              <CardContent className="p-8 text-center">
                <Calendar className="w-10 h-10 text-muted-foreground mx-auto mb-3" />
                <p className="text-muted-foreground font-medium">{t("schoolYears.emptyTitle")}</p>
                <p className="text-sm text-muted-foreground mt-1">{t("schoolYears.emptyHint")}</p>
              </CardContent>
            </Card>
          )}
        </div>
      )}

      <SchoolYearClosureDialog
        sourceYear={closureYear}
        schoolYears={schoolYears}
        open={Boolean(closureYear)}
        onOpenChange={(nextOpen) => { if (!nextOpen) setClosureYear(null); }}
        onCompleted={refetch}
      />
    </div>
  );
}
