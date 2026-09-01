import { useState, useMemo } from "react";
import { useTeachers } from "@/hooks/use-teachers";
import { useAuth } from "@/hooks/use-auth";
import { useAppStore } from "@/stores/app-store";
import { useDemoStore } from "@/stores/demo";
import { useI18n } from "@/i18n";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  UserCog, Plus, Mail, Phone, Edit, Archive, Building2, Search, Info, Loader2, Trophy,
} from "lucide-react";
import { toast } from "sonner";
import {
  Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger,
} from "@/components/ui/dialog";
import type { Teacher } from "@/types";
import { cn } from "@/lib/utils";

export default function TeachersPage() {
  const { teachers, classes, teacherAssignedClassIds, primaryClassByTeacherId, loading, error, canAddManually, updateTeacher, archiveTeacher } = useTeachers();
  const { user } = useAuth();
  const { t } = useI18n();

  // Demo-only store actions
  const storeAddTeacher = useAppStore((s) => s.addTeacher);
  const isDemo = useDemoStore((s) => s.isDemoMode);

  const canManage = user?.role === "admin" || user?.role === "directeur";
  const canAssignPrincipal = user?.role === "admin";

  const [open, setOpen] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [selectedClassIds, setSelectedClassIds] = useState<string[]>([]);
  const [primaryClassId, setPrimaryClassId] = useState("none");
  const [search, setSearch] = useState("");
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState("");
  const [archiving, setArchiving] = useState<string | null>(null);

  const handleArchive = async (teacher: Teacher) => {
    if (!window.confirm(t("teachers.archiveConfirm", { name: `${teacher.firstName} ${teacher.lastName}` }))) return;
    setArchiving(teacher.id);
    try {
      await archiveTeacher(teacher.id);
      toast.success(t("teachers.archived", { name: `${teacher.firstName} ${teacher.lastName}` }));
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : t("common.archiveError"));
    } finally {
      setArchiving(null);
    }
  };

  const filteredTeachers = useMemo(() => {
    if (!search) return teachers;
    const q = search.toLowerCase();
    return teachers.filter((teacher) =>
      teacher.firstName.toLowerCase().includes(q) ||
      teacher.lastName.toLowerCase().includes(q) ||
      teacher.email.toLowerCase().includes(q)
    );
  }, [teachers, search]);

  const handleSubmit = async () => {
    setSaveError("");
    setSaving(true);
    try {
      if (editId) {
        await updateTeacher(editId, {
          firstName, lastName, phone, assignedClassIds: selectedClassIds,
          ...(user?.role === "admin" ? { primaryClassId: primaryClassId === "none" ? null : primaryClassId } : {}),
        });
      } else if (canAddManually) {
        storeAddTeacher({ firstName, lastName, email, phone });
      }
      resetForm();
    } catch (e: unknown) {
      setSaveError(e instanceof Error ? e.message : t("common.saveError"));
    } finally {
      setSaving(false);
    }
  };

  const handleEdit = (teacher: Teacher) => {
    setEditId(teacher.id);
    setFirstName(teacher.firstName);
    setLastName(teacher.lastName);
    setEmail(teacher.email);
    setPhone(teacher.phone ?? "");
    setSelectedClassIds(teacherAssignedClassIds[teacher.id] ?? []);
    setPrimaryClassId(primaryClassByTeacherId[teacher.id] ?? "none");
    setSaveError("");
    setOpen(true);
  };

  const resetForm = () => {
    setOpen(false);
    setEditId(null);
    setFirstName("");
    setLastName("");
    setEmail("");
    setPhone("");
    setSelectedClassIds([]);
    setPrimaryClassId("none");
    setSaveError("");
  };

  const toggleClass = (classId: string) => {
    setSelectedClassIds((prev) =>
      prev.includes(classId) ? prev.filter((id) => id !== classId) : [...prev, classId]
    );
  };

  return (
    <div className="space-y-6 animate-in fade-in duration-500">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">{t("teachers.title")}</h1>
          <p className="text-sm text-muted-foreground">
            {loading ? t("common.loading") : t("teachers.count", { count: teachers.length })}
          </p>
        </div>

        {canAddManually ? (
          <Dialog open={open} onOpenChange={(o) => { setOpen(o); if (!o) resetForm(); }}>
            <DialogTrigger asChild>
              <Button size="sm" className="gap-2">
                <Plus className="w-4 h-4" /> {t("teachers.addTeacher")}
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>{editId ? t("teachers.editTitle") : t("teachers.addTitle")}</DialogTitle>
                <DialogDescription>{t("teachers.formDesc")}</DialogDescription>
              </DialogHeader>
              <div className="space-y-4 pt-2">
                {saveError && (
                  <p className="text-sm text-destructive bg-destructive/10 px-3 py-2 rounded-lg">{saveError}</p>
                )}
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-2">
                    <Label>{t("teachers.firstName")}</Label>
                    <Input value={firstName} onChange={(e) => setFirstName(e.target.value)} placeholder="Sophie" />
                  </div>
                  <div className="space-y-2">
                    <Label>{t("teachers.lastName")}</Label>
                    <Input value={lastName} onChange={(e) => setLastName(e.target.value)} placeholder="Diallo" />
                  </div>
                </div>
                {!editId && (
                  <div className="space-y-2">
                    <Label>{t("teachers.email")}</Label>
                    <Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="professeur@ecole.sn" dir="ltr" />
                  </div>
                )}
                <div className="space-y-2">
                  <Label>{t("teachers.phone")}</Label>
                  <Input value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="+221 77 000 00 00" dir="ltr" />
                </div>
                {editId && classes.length > 0 && (
                  <ClassSelector
                    classes={classes}
                    selectedIds={selectedClassIds}
                    onToggle={toggleClass}
                  />
                )}
                {editId && user?.role === "admin" && (
                  <PrincipalClassSelector classes={classes} value={primaryClassId} onChange={setPrimaryClassId} />
                )}
                <Button
                  onClick={handleSubmit}
                  className="w-full"
                  disabled={saving || !firstName || !lastName || (!editId && !email)}
                >
                  {saving ? <Loader2 className="w-4 h-4 animate-spin me-2" /> : null}
                  {editId ? t("common.save") : t("common.add")}
                </Button>
              </div>
            </DialogContent>
          </Dialog>
        ) : (
          <div className="flex items-center gap-2 text-sm text-muted-foreground bg-muted/50 px-3 py-2 rounded-lg">
            <Info className="w-4 h-4 shrink-0 text-primary" />
            {t("teachers.selfRegister")} <strong className="text-foreground ms-1">/register</strong>
          </div>
        )}
      </div>

      {error && (
        <div className="flex items-center gap-2 p-3 rounded-lg bg-destructive/10 text-destructive text-sm">
          <Info className="w-4 h-4 shrink-0" /> {error}
        </div>
      )}

      <div className="relative flex-1">
        <Search className="absolute start-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
        <Input
          placeholder={t("teachers.searchPlaceholder")}
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="ps-9 max-w-md"
        />
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-16">
          <Loader2 className="w-8 h-8 animate-spin text-muted-foreground" />
        </div>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {filteredTeachers.map((teacher) => {
            const assignedClassIds = teacherAssignedClassIds[teacher.id] ?? [];
            const assignedClasses = classes.filter((c) => assignedClassIds.includes(c.id));
            const primaryClass = classes.find((c) => c.id === primaryClassByTeacherId[teacher.id]);
            return (
              <Card key={teacher.id} className="border-border/50 group">
                <CardContent className="p-4">
                  <div className="flex items-start gap-3 mb-3">
                    <div className="w-11 h-11 rounded-xl bg-violet-500/10 flex items-center justify-center text-violet-600 font-bold text-sm shrink-0">
                      {teacher.firstName[0]}{teacher.lastName[0] ?? ""}
                    </div>
                    <div className="flex-1 min-w-0">
                      <h3
                        className="font-semibold text-foreground leading-tight text-left"
                        dir="ltr"
                        title={`${teacher.firstName} ${teacher.lastName}`}
                      >
                        <span className="block break-words">{teacher.firstName}</span>
                        <span className="block break-words">{teacher.lastName}</span>
                      </h3>
                      <div className="flex flex-col gap-0.5 mt-1">
                        <span className="text-xs text-muted-foreground flex items-center gap-1">
                          <Mail className="w-3 h-3" /> {teacher.email}
                        </span>
                        {teacher.phone && (
                          <span className="text-xs text-muted-foreground flex items-center gap-1">
                            <Phone className="w-3 h-3" /> {teacher.phone}
                          </span>
                        )}
                      </div>
                    </div>
                    <div className={cn("flex items-center gap-0.5", canAssignPrincipal ? "opacity-100" : "opacity-0 group-hover:opacity-100")}>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-7 w-7"
                        onClick={() => handleEdit(teacher)}
                      >
                        <Edit className="w-3.5 h-3.5" />
                      </Button>
                      {canManage && (
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-7 w-7 text-destructive hover:text-destructive hover:bg-destructive/10"
                          disabled={archiving === teacher.id}
                          onClick={() => handleArchive(teacher)}
                        >
                          {archiving === teacher.id
                            ? <Loader2 className="w-3.5 h-3.5 animate-spin" />
                            : <Archive className="w-3.5 h-3.5" />}
                        </Button>
                      )}
                    </div>
                  </div>

                  {assignedClasses.length > 0 ? (
                    <div className="flex flex-wrap gap-1.5 mt-2">
                      {assignedClasses.map((c) => (
                        <Badge key={c.id} variant="secondary" className="text-xs gap-1">
                          <Building2 className="w-3 h-3" /> {c.name}
                        </Badge>
                      ))}
                    </div>
                  ) : (
                    <p className="text-xs text-muted-foreground italic">{t("teachers.noClassAssigned")}</p>
                  )}
                  {primaryClass && (
                    <Badge className="mt-2 bg-amber-500/10 text-amber-700 border-amber-500/20 hover:bg-amber-500/10">
                      {t("teachers.principalBadge", { name: primaryClass.name })}
                    </Badge>
                  )}
                  {canAssignPrincipal && (
                    <Button
                      variant="outline"
                      size="sm"
                      className="w-full mt-3 gap-2"
                      onClick={() => handleEdit(teacher)}
                    >
                      <Trophy className="w-4 h-4 text-amber-500" />
                      {t("teachers.assignPrincipalClass")}
                    </Button>
                  )}
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      {!loading && filteredTeachers.length === 0 && (
        <Card className="border-dashed border-2">
          <CardContent className="p-8 text-center">
            <UserCog className="w-10 h-10 text-muted-foreground mx-auto mb-3" />
            <p className="text-muted-foreground font-medium">
              {isDemo ? t("teachers.emptyDemo") : t("teachers.emptyReal")}
            </p>
            <p className="text-sm text-muted-foreground mt-1">
              {isDemo ? t("teachers.emptyDemoHint") : t("teachers.emptyRealHint")}
            </p>
          </CardContent>
        </Card>
      )}

      {/* Edit dialog — real mode */}
      {!canAddManually && (
        <Dialog open={open} onOpenChange={(o) => { setOpen(o); if (!o) resetForm(); }}>
          <DialogContent className="max-w-md">
            <DialogHeader>
              <DialogTitle>{t("teachers.editProfileTitle")}</DialogTitle>
              <DialogDescription>{t("teachers.editProfileDesc")}</DialogDescription>
            </DialogHeader>
            <div className="space-y-4 pt-2">
              {saveError && (
                <p className="text-sm text-destructive bg-destructive/10 px-3 py-2 rounded-lg">{saveError}</p>
              )}
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-2">
                  <Label>{t("teachers.firstName")}</Label>
                  <Input value={firstName} onChange={(e) => setFirstName(e.target.value)} />
                </div>
                <div className="space-y-2">
                  <Label>{t("teachers.lastName")}</Label>
                  <Input value={lastName} onChange={(e) => setLastName(e.target.value)} />
                </div>
              </div>
              <div className="space-y-2">
                <Label>{t("teachers.phone")}</Label>
                <Input value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="+221 77 000 00 00" dir="ltr" />
              </div>

              <ClassSelector
                classes={classes}
                selectedIds={selectedClassIds}
                onToggle={toggleClass}
              />

              {user?.role === "admin" && (
                <PrincipalClassSelector classes={classes} value={primaryClassId} onChange={setPrimaryClassId} />
              )}

              <Button onClick={handleSubmit} className="w-full" disabled={saving || !firstName}>
                {saving ? <Loader2 className="w-4 h-4 animate-spin me-2" /> : null}
                {t("common.saveChanges")}
              </Button>
            </div>
          </DialogContent>
        </Dialog>
      )}
    </div>
  );
}

// ── Class multi-selector component ────────────────────────────────────────────

interface PrincipalClassSelectorProps {
  classes: Array<{ id: string; name: string }>;
  value: string;
  onChange: (id: string) => void;
}

function PrincipalClassSelector({ classes, value, onChange }: PrincipalClassSelectorProps) {
  const { t } = useI18n();
  return (
    <div className="space-y-2 rounded-lg border border-amber-500/20 bg-amber-500/5 p-3">
      <Label>{t("teachers.principalClass")}</Label>
      <Select value={value} onValueChange={onChange}>
        <SelectTrigger><SelectValue placeholder={t("teachers.selectPrincipalClass")} /></SelectTrigger>
        <SelectContent>
          <SelectItem value="none">{t("teachers.noPrincipalClass")}</SelectItem>
          {classes.map((classe) => (
            <SelectItem key={classe.id} value={classe.id}>{classe.name}</SelectItem>
          ))}
        </SelectContent>
      </Select>
      <p className="text-xs text-muted-foreground">{t("teachers.principalClassHint")}</p>
    </div>
  );
}

interface ClassSelectorProps {
  classes: Array<{ id: string; name: string }>;
  selectedIds: string[];
  onToggle: (id: string) => void;
}

function ClassSelector({ classes, selectedIds, onToggle }: ClassSelectorProps) {
  const { t } = useI18n();
  if (classes.length === 0) {
    return (
      <div className="flex items-center gap-2 p-3 rounded-lg bg-muted/40 text-sm text-muted-foreground">
        <Building2 className="w-4 h-4 shrink-0" />
        {t("teachers.noClassCreateFirst")}
      </div>
    );
  }

  return (
    <div className="space-y-2">
      <Label className="flex items-center gap-1.5">
        <Building2 className="w-4 h-4" />
        {t("teachers.assignedClasses")}
        {selectedIds.length > 0 && (
          <span className="ms-auto text-xs font-normal text-primary">
            {t("teachers.selectedCount", { count: selectedIds.length })}
          </span>
        )}
      </Label>
      <ScrollArea className="h-44 rounded-lg border border-border">
        <div className="p-2 space-y-1">
          {classes.map((cls) => (
            <div
              key={cls.id}
              className="flex items-center gap-3 px-2 py-2 rounded-lg hover:bg-muted/50 cursor-pointer transition-colors"
              onClick={() => onToggle(cls.id)}
            >
              <Checkbox
                checked={selectedIds.includes(cls.id)}
                onCheckedChange={() => onToggle(cls.id)}
                id={`cls-edit-${cls.id}`}
              />
              <label
                htmlFor={`cls-edit-${cls.id}`}
                className="text-sm font-medium cursor-pointer select-none flex-1"
              >
                {cls.name}
              </label>
            </div>
          ))}
        </div>
      </ScrollArea>
    </div>
  );
}
