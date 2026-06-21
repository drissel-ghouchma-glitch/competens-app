import { useState, useMemo } from "react";
import { useTeachers } from "@/hooks/use-teachers";
import { useAppStore } from "@/stores/app-store";
import { useDemoStore } from "@/stores/demo";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  UserCog, Plus, Mail, Phone, Edit, Building2, Search, Info, Loader2,
} from "lucide-react";
import {
  Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger,
} from "@/components/ui/dialog";
import type { Teacher } from "@/types";

export default function TeachersPage() {
  const { teachers, classes, teacherAssignedClassIds, loading, error, canAddManually, updateTeacher } = useTeachers();

  // Demo-only store actions
  const storeAddTeacher = useAppStore((s) => s.addTeacher);
  const isDemo = useDemoStore((s) => s.isDemoMode);

  const [open, setOpen] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [selectedClassIds, setSelectedClassIds] = useState<string[]>([]);
  const [search, setSearch] = useState("");
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState("");

  const filteredTeachers = useMemo(() => {
    if (!search) return teachers;
    const q = search.toLowerCase();
    return teachers.filter((t) =>
      t.firstName.toLowerCase().includes(q) ||
      t.lastName.toLowerCase().includes(q) ||
      t.email.toLowerCase().includes(q)
    );
  }, [teachers, search]);

  const handleSubmit = async () => {
    setSaveError("");
    setSaving(true);
    try {
      if (editId) {
        await updateTeacher(editId, { firstName, lastName, phone, assignedClassIds: selectedClassIds });
      } else if (canAddManually) {
        storeAddTeacher({ firstName, lastName, email, phone });
      }
      resetForm();
    } catch (e: unknown) {
      setSaveError(e instanceof Error ? e.message : "Erreur lors de l'enregistrement");
    } finally {
      setSaving(false);
    }
  };

  const handleEdit = (t: Teacher) => {
    setEditId(t.id);
    setFirstName(t.firstName);
    setLastName(t.lastName);
    setEmail(t.email);
    setPhone(t.phone ?? "");
    setSelectedClassIds(teacherAssignedClassIds[t.id] ?? []);
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
          <h1 className="text-2xl font-bold tracking-tight">Professeurs</h1>
          <p className="text-sm text-muted-foreground">
            {loading ? "Chargement…" : `${teachers.length} professeur${teachers.length !== 1 ? "s" : ""}`}
          </p>
        </div>

        {canAddManually ? (
          <Dialog open={open} onOpenChange={(o) => { setOpen(o); if (!o) resetForm(); }}>
            <DialogTrigger asChild>
              <Button size="sm" className="gap-2">
                <Plus className="w-4 h-4" /> Ajouter un professeur
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>{editId ? "Modifier" : "Ajouter"} un professeur</DialogTitle>
                <DialogDescription>Renseignez les informations du professeur</DialogDescription>
              </DialogHeader>
              <div className="space-y-4 pt-2">
                {saveError && (
                  <p className="text-sm text-destructive bg-destructive/10 px-3 py-2 rounded-lg">{saveError}</p>
                )}
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-2">
                    <Label>Prénom</Label>
                    <Input value={firstName} onChange={(e) => setFirstName(e.target.value)} placeholder="Sophie" />
                  </div>
                  <div className="space-y-2">
                    <Label>Nom</Label>
                    <Input value={lastName} onChange={(e) => setLastName(e.target.value)} placeholder="Diallo" />
                  </div>
                </div>
                {!editId && (
                  <div className="space-y-2">
                    <Label>Email</Label>
                    <Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="professeur@ecole.sn" />
                  </div>
                )}
                <div className="space-y-2">
                  <Label>Téléphone</Label>
                  <Input value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="+221 77 000 00 00" />
                </div>
                {editId && classes.length > 0 && (
                  <ClassSelector
                    classes={classes}
                    selectedIds={selectedClassIds}
                    onToggle={toggleClass}
                  />
                )}
                <Button
                  onClick={handleSubmit}
                  className="w-full"
                  disabled={saving || !firstName || !lastName || (!editId && !email)}
                >
                  {saving ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : null}
                  {editId ? "Enregistrer" : "Ajouter"}
                </Button>
              </div>
            </DialogContent>
          </Dialog>
        ) : (
          <div className="flex items-center gap-2 text-sm text-muted-foreground bg-muted/50 px-3 py-2 rounded-lg">
            <Info className="w-4 h-4 shrink-0 text-primary" />
            Les professeurs s'inscrivent via <strong className="text-foreground ml-1">/register</strong>
          </div>
        )}
      </div>

      {error && (
        <div className="flex items-center gap-2 p-3 rounded-lg bg-destructive/10 text-destructive text-sm">
          <Info className="w-4 h-4 shrink-0" /> {error}
        </div>
      )}

      <div className="relative flex-1">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
        <Input
          placeholder="Rechercher un professeur..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="pl-9 max-w-md"
        />
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-16">
          <Loader2 className="w-8 h-8 animate-spin text-muted-foreground" />
        </div>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {filteredTeachers.map((t) => {
            const assignedClassIds = teacherAssignedClassIds[t.id] ?? [];
            const assignedClasses = classes.filter((c) => assignedClassIds.includes(c.id));
            return (
              <Card key={t.id} className="border-border/50 group">
                <CardContent className="p-4">
                  <div className="flex items-start gap-3 mb-3">
                    <div className="w-11 h-11 rounded-xl bg-violet-500/10 flex items-center justify-center text-violet-600 font-bold text-sm shrink-0">
                      {t.firstName[0]}{t.lastName[0] ?? ""}
                    </div>
                    <div className="flex-1 min-w-0">
                      <h3 className="font-semibold text-foreground truncate">{t.firstName} {t.lastName}</h3>
                      <div className="flex flex-col gap-0.5 mt-1">
                        <span className="text-xs text-muted-foreground flex items-center gap-1">
                          <Mail className="w-3 h-3" /> {t.email}
                        </span>
                        {t.phone && (
                          <span className="text-xs text-muted-foreground flex items-center gap-1">
                            <Phone className="w-3 h-3" /> {t.phone}
                          </span>
                        )}
                      </div>
                    </div>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-7 w-7 opacity-0 group-hover:opacity-100"
                      onClick={() => handleEdit(t)}
                    >
                      <Edit className="w-3.5 h-3.5" />
                    </Button>
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
                    <p className="text-xs text-muted-foreground italic">Aucune classe attribuée</p>
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
              {isDemo ? "Aucun professeur trouvé" : "Aucun professeur actif"}
            </p>
            <p className="text-sm text-muted-foreground mt-1">
              {isDemo
                ? "Ajoutez des professeurs manuellement"
                : "Les professeurs apparaîtront ici après inscription et validation"}
            </p>
          </CardContent>
        </Card>
      )}

      {/* Edit dialog — real mode */}
      {!canAddManually && (
        <Dialog open={open} onOpenChange={(o) => { setOpen(o); if (!o) resetForm(); }}>
          <DialogContent className="max-w-md">
            <DialogHeader>
              <DialogTitle>Modifier le professeur</DialogTitle>
              <DialogDescription>Modifier le profil et les classes assignées</DialogDescription>
            </DialogHeader>
            <div className="space-y-4 pt-2">
              {saveError && (
                <p className="text-sm text-destructive bg-destructive/10 px-3 py-2 rounded-lg">{saveError}</p>
              )}
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-2">
                  <Label>Prénom</Label>
                  <Input value={firstName} onChange={(e) => setFirstName(e.target.value)} />
                </div>
                <div className="space-y-2">
                  <Label>Nom</Label>
                  <Input value={lastName} onChange={(e) => setLastName(e.target.value)} />
                </div>
              </div>
              <div className="space-y-2">
                <Label>Téléphone</Label>
                <Input value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="+221 77 000 00 00" />
              </div>

              <ClassSelector
                classes={classes}
                selectedIds={selectedClassIds}
                onToggle={toggleClass}
              />

              <Button onClick={handleSubmit} className="w-full" disabled={saving || !firstName}>
                {saving ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : null}
                Enregistrer les modifications
              </Button>
            </div>
          </DialogContent>
        </Dialog>
      )}
    </div>
  );
}

// ── Class multi-selector component ────────────────────────────────────────────

interface ClassSelectorProps {
  classes: Array<{ id: string; name: string }>;
  selectedIds: string[];
  onToggle: (id: string) => void;
}

function ClassSelector({ classes, selectedIds, onToggle }: ClassSelectorProps) {
  if (classes.length === 0) {
    return (
      <div className="flex items-center gap-2 p-3 rounded-lg bg-muted/40 text-sm text-muted-foreground">
        <Building2 className="w-4 h-4 shrink-0" />
        Aucune classe disponible — créez des classes d'abord.
      </div>
    );
  }

  return (
    <div className="space-y-2">
      <Label className="flex items-center gap-1.5">
        <Building2 className="w-4 h-4" />
        Classes assignées
        {selectedIds.length > 0 && (
          <span className="ml-auto text-xs font-normal text-primary">
            {selectedIds.length} sélectionnée{selectedIds.length > 1 ? "s" : ""}
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
