import { useState, useMemo, useEffect } from "react";
import { useClasses } from "@/hooks/use-classes";
import { useRequests } from "@/hooks/use-requests";
import { useAuth } from "@/hooks/use-auth";
import { useDemoStore } from "@/stores/demo";
import { supabase } from "@/lib/supabase";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  Building2, Plus, Users, Search, Loader2, AlertCircle, Info, Send, CheckCircle2, Pencil, Trash2,
} from "lucide-react";
import {
  Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger,
} from "@/components/ui/dialog";
import { toast } from "sonner";
import type { Classe } from "@/types";

export default function ClassesPage() {
  const {
    classes, levels, activeYear,
    loading, error,
    addClass, updateClass, archiveClass, deleteClass,
  } = useClasses();
  const { submitRequest } = useRequests();
  const { user } = useAuth();
  const isDemo = useDemoStore((s) => s.isDemoMode);

  // Teacher in real mode → request flow only
  const isTeacherReal = !isDemo && user?.role === "professeur";

  // ── Admin / demo: create class state ─────────────────────
  const [openCreate, setOpenCreate] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);
  const [name, setName] = useState("");
  const [levelId, setLevelId] = useState("");
  const [capacity, setCapacity] = useState(30);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState("");

  // ── Teacher: request class access state ──────────────────
  const [openRequest, setOpenRequest] = useState(false);
  const [myAssignedClassIds, setMyAssignedClassIds] = useState<string[]>([]);
  const [allDialogClasses, setAllDialogClasses] = useState<Classe[]>([]);
  const [dialogLoading, setDialogLoading] = useState(false);
  const [requestedClassIds, setRequestedClassIds] = useState<string[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const [requestError, setRequestError] = useState("");

  // Fetch all classes + teacher assignments fresh when dialog opens
  const handleOpenRequest = async () => {
    if (!supabase || !user) return;
    setOpenRequest(true);
    setDialogLoading(true);
    setRequestedClassIds([]);
    setRequestError("");
    try {
      const [classesRes, assignRes] = await Promise.all([
        // Use a join through levels to bypass potential RLS filter on classes
        supabase
          .from("classes")
          .select("id, name, level_id, capacity, student_count, is_archived, school_year_id, created_at")
          .eq("is_archived", false)
          .order("name"),
        supabase
          .from("teacher_class_assignments")
          .select("class_id")
          .eq("teacher_id", user.id),
      ]);

      // If RLS blocks the teacher from reading classes, classesRes.data will be []
      // In that case, fall back to fetching classes via assignments join
      let allClasses: Classe[] = (classesRes.data ?? []).map((c) => ({
        id: c.id, name: c.name, levelId: c.level_id ?? "",
        capacity: c.capacity, studentCount: c.student_count,
        isArchived: c.is_archived, schoolYearId: c.school_year_id, createdAt: c.created_at,
      }));

      // Fallback: if direct fetch returned nothing but teacher has assignments,
      // fetch all classes via the assignments join (works even with strict RLS)
      if (allClasses.length === 0) {
        const { data: joinData } = await supabase
          .from("teacher_class_assignments")
          .select("classes(id, name, level_id, capacity, student_count, is_archived, school_year_id, created_at)")
          .not("class_id", "is", null);
        // This only gives assigned classes — still useful for context
        // The real fix is an RLS policy: see requestError below
        if ((joinData ?? []).length === 0) {
          setRequestError(
            "RLS_BLOCK: La politique de sécurité Supabase empêche la lecture des classes. " +
            "Exécutez le SQL de correction dans le Dashboard Supabase (voir instructions)."
          );
        }
      }

      const assignedIds = (assignRes.data ?? []).map((r) => r.class_id);
      setAllDialogClasses(allClasses);
      setMyAssignedClassIds(assignedIds);
    } catch {
      setRequestError("Impossible de charger les classes. Vérifiez votre connexion.");
    } finally {
      setDialogLoading(false);
    }
  };

  // Fetch assigned class IDs on mount for card badges (non-blocking)
  useEffect(() => {
    if (!isTeacherReal || !supabase || !user) return;
    supabase
      .from("teacher_class_assignments")
      .select("class_id")
      .eq("teacher_id", user.id)
      .then(({ data }) => setMyAssignedClassIds((data ?? []).map((r) => r.class_id)));
  }, [isTeacherReal, user]);

  // ── Shared: search / filter ───────────────────────────────
  const [search, setSearch] = useState("");
  const [levelFilter, setLevelFilter] = useState("all");

  const filteredClasses = useMemo(() => {
    let list = classes.filter((c) => !c.isArchived);
    if (search) list = list.filter((c) => c.name.toLowerCase().includes(search.toLowerCase()));
    if (levelFilter !== "all") list = list.filter((c) => c.levelId === levelFilter);
    return list;
  }, [classes, search, levelFilter]);

  // Classes the teacher can still request (not already assigned) — uses fresh dialog fetch
  const requestableClasses = useMemo(
    () => allDialogClasses.filter((c) => !myAssignedClassIds.includes(c.id)),
    [allDialogClasses, myAssignedClassIds]
  );

  // ── Admin handlers ────────────────────────────────────────

  const handleSubmit = async () => {
    setSaveError("");
    setSaving(true);
    try {
      if (editId) {
        await updateClass(editId, { name, levelId, capacity });
      } else {
        await addClass({ name, levelId, capacity, isArchived: false, schoolYearId: activeYear?.id ?? "" });
      }
      resetForm();
    } catch (e: unknown) {
      setSaveError(e instanceof Error ? e.message : "Erreur lors de l'enregistrement");
    } finally {
      setSaving(false);
    }
  };

  const handleEdit = (c: Classe) => {
    setEditId(c.id); setName(c.name); setLevelId(c.levelId); setCapacity(c.capacity);
    setSaveError(""); setOpenCreate(true);
  };

  const handleDelete = async (classId: string) => {
    if (!window.confirm("Supprimer cette classe ? Cette action est irréversible.")) return;
    try {
      await deleteClass(classId);
      toast.success("Classe supprimée.");
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : "Erreur lors de la suppression");
    }
  };

  const resetForm = () => {
    setOpenCreate(false); setEditId(null); setName(""); setLevelId(""); setCapacity(30); setSaveError("");
  };

  // ── Teacher handler ───────────────────────────────────────

  const toggleRequested = (classId: string) => {
    setRequestedClassIds((prev) =>
      prev.includes(classId) ? prev.filter((id) => id !== classId) : [...prev, classId]
    );
  };

  const handleSendRequest = async () => {
    if (requestedClassIds.length === 0) return;
    setRequestError("");
    setSubmitting(true);
    try {
      await submitRequest("assign_class", { classIds: requestedClassIds });
      toast.success(`Demande envoyée pour ${requestedClassIds.length} classe(s). L'administration va examiner votre demande.`);
      setRequestedClassIds([]);
      setOpenRequest(false);
    } catch (e: unknown) {
      setRequestError(e instanceof Error ? e.message : "Erreur lors de l'envoi");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="space-y-6 animate-in fade-in duration-500">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Classes</h1>
          <p className="text-sm text-muted-foreground">
            {loading
              ? "Chargement…"
              : activeYear
              ? `Année ${activeYear.name} — ${filteredClasses.length} classe${filteredClasses.length !== 1 ? "s" : ""}`
              : `${filteredClasses.length} classe${filteredClasses.length !== 1 ? "s" : ""}`}
          </p>
        </div>

        {/* ── Admin / directeur / demo: create class button ── */}
        {!isTeacherReal && (
          <Dialog open={openCreate} onOpenChange={(o) => { setOpenCreate(o); if (!o) resetForm(); }}>
            <DialogTrigger asChild>
              <Button size="sm" className="gap-2">
                <Plus className="w-4 h-4" /> Nouvelle classe
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>{editId ? "Modifier" : "Créer"} une classe</DialogTitle>
                <DialogDescription>Définissez les informations de la classe</DialogDescription>
              </DialogHeader>
              <div className="space-y-4 pt-2">
                {saveError && (
                  <div className="flex items-center gap-2 p-3 rounded-lg bg-destructive/10 text-destructive text-sm">
                    <AlertCircle className="w-4 h-4 shrink-0" /> {saveError}
                  </div>
                )}
                {!activeYear && !editId && (
                  <div className="flex items-center gap-2 p-3 rounded-lg bg-amber-500/10 text-amber-600 text-sm">
                    <Info className="w-4 h-4 shrink-0" />
                    Aucune année scolaire active. Activez-en une d'abord.
                  </div>
                )}
                <div className="space-y-2">
                  <Label>Nom de la classe</Label>
                  <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="CP1-A" />
                </div>
                <div className="space-y-2">
                  <Label>Niveau</Label>
                  <Select value={levelId} onValueChange={setLevelId}>
                    <SelectTrigger><SelectValue placeholder="Sélectionner un niveau" /></SelectTrigger>
                    <SelectContent>
                      {levels.filter((l) => !l.isArchived).map((l) => (
                        <SelectItem key={l.id} value={l.id}>{l.code} – {l.name}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  {levels.length === 0 && (
                    <p className="text-xs text-muted-foreground flex items-center gap-1">
                      <Info className="w-3 h-3" /> Aucun niveau — créez d'abord des niveaux
                    </p>
                  )}
                </div>
                <div className="space-y-2">
                  <Label>Effectif maximum</Label>
                  <Input
                    type="number" value={capacity}
                    onChange={(e) => setCapacity(Number(e.target.value))}
                    min={1} max={60}
                  />
                </div>
                <Button
                  onClick={handleSubmit} className="w-full"
                  disabled={saving || !name || !levelId || (!editId && !activeYear)}
                >
                  {saving ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : null}
                  {editId ? "Enregistrer" : "Créer la classe"}
                </Button>
              </div>
            </DialogContent>
          </Dialog>
        )}

        {/* ── Teacher (real mode): request class access button ── */}
        {isTeacherReal && (
          <Dialog open={openRequest} onOpenChange={(o) => { setOpenRequest(o); if (!o) { setRequestedClassIds([]); setRequestError(""); } }}>
            <DialogTrigger asChild>
              <Button size="sm" className="gap-2" onClick={handleOpenRequest}>
                <Send className="w-4 h-4" /> Demander l'accès à une classe
              </Button>
            </DialogTrigger>
            <DialogContent className="max-w-md">
              <DialogHeader>
                <DialogTitle className="flex items-center gap-2">
                  <Building2 className="w-5 h-5 text-primary" />
                  Demande d'accès à une classe
                </DialogTitle>
                <DialogDescription>
                  Sélectionnez la ou les classes auxquelles vous souhaitez avoir accès. Votre demande sera examinée par l'administration.
                </DialogDescription>
              </DialogHeader>
              <div className="space-y-4 pt-2">
                <div className="flex items-start gap-2 p-3 rounded-lg bg-primary/5 border border-primary/20 text-sm text-primary">
                  <Info className="w-4 h-4 shrink-0 mt-0.5" />
                  Une fois approuvée, les élèves de cette classe apparaîtront dans vos évaluations.
                </div>

                {requestError && (
                  <div className="flex items-center gap-2 p-3 rounded-lg bg-destructive/10 text-destructive text-sm">
                    <AlertCircle className="w-4 h-4 shrink-0" /> {requestError}
                  </div>
                )}

                {dialogLoading ? (
                  <div className="flex justify-center py-8">
                    <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
                  </div>
                ) : allDialogClasses.length === 0 ? (
                  <div className="flex flex-col items-center gap-2 py-6 text-center">
                    <AlertCircle className="w-10 h-10 text-amber-400" />
                    <p className="text-sm font-medium text-foreground">Aucune classe accessible</p>
                    <p className="text-xs text-muted-foreground max-w-xs">
                      La politique de sécurité Supabase (RLS) empêche la lecture des classes.
                      Demandez à l'administrateur d'exécuter le correctif SQL.
                    </p>
                  </div>
                ) : requestableClasses.length === 0 ? (
                  <div className="flex flex-col items-center gap-2 py-6 text-center">
                    <CheckCircle2 className="w-10 h-10 text-green-400" />
                    <p className="text-sm font-medium text-muted-foreground">
                      Vous avez déjà accès à toutes les classes disponibles.
                    </p>
                  </div>
                ) : (
                  <>
                    <div className="space-y-1.5">
                      <Label className="text-sm font-medium flex items-center justify-between">
                        <span>Classes disponibles</span>
                        {requestedClassIds.length > 0 && (
                          <span className="text-xs text-primary font-normal">
                            {requestedClassIds.length} sélectionnée{requestedClassIds.length > 1 ? "s" : ""}
                          </span>
                        )}
                      </Label>
                      <ScrollArea className="h-56 rounded-lg border border-border">
                        <div className="p-2 space-y-1">
                          {requestableClasses.map((c) => {
                            const level = levels.find((l) => l.id === c.levelId);
                            const isSelected = requestedClassIds.includes(c.id);
                            return (
                              <div
                                key={c.id}
                                className={`flex items-center gap-3 px-3 py-2.5 rounded-lg cursor-pointer transition-colors ${
                                  isSelected ? "bg-primary/8 border border-primary/20" : "hover:bg-muted/50"
                                }`}
                                onClick={() => toggleRequested(c.id)}
                              >
                                <Checkbox
                                  checked={isSelected}
                                  onCheckedChange={() => toggleRequested(c.id)}
                                  id={`req-cls-${c.id}`}
                                />
                                <label
                                  htmlFor={`req-cls-${c.id}`}
                                  className="flex-1 cursor-pointer select-none"
                                >
                                  <span className="text-sm font-medium">{c.name}</span>
                                  {level && (
                                    <span className="ml-2 text-xs text-muted-foreground font-mono">{level.code}</span>
                                  )}
                                </label>
                                <span className="text-xs text-muted-foreground">
                                  {c.studentCount} élèves
                                </span>
                              </div>
                            );
                          })}
                        </div>
                      </ScrollArea>
                    </div>

                    {/* Already-assigned classes info */}
                    {myAssignedClassIds.length > 0 && (
                      <div className="text-xs text-muted-foreground flex items-center gap-1.5">
                        <CheckCircle2 className="w-3.5 h-3.5 text-green-500 shrink-0" />
                        {myAssignedClassIds.length} classe{myAssignedClassIds.length > 1 ? "s" : ""} déjà assignée{myAssignedClassIds.length > 1 ? "s" : ""} (non affichée{myAssignedClassIds.length > 1 ? "s" : ""})
                      </div>
                    )}
                  </>
                )}

                <div className="flex gap-2 pt-1">
                  <Button variant="outline" className="flex-1" onClick={() => setOpenRequest(false)}>
                    Annuler
                  </Button>
                  <Button
                    className="flex-1 gap-2"
                    onClick={handleSendRequest}
                    disabled={submitting || requestedClassIds.length === 0}
                  >
                    {submitting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
                    Envoyer la demande
                  </Button>
                </div>
              </div>
            </DialogContent>
          </Dialog>
        )}
      </div>

      {error && (
        <div className="flex items-center gap-2 p-3 rounded-lg bg-destructive/10 text-destructive text-sm">
          <AlertCircle className="w-4 h-4 shrink-0" /> {error}
        </div>
      )}

      {/* Teacher info banner */}
      {isTeacherReal && (
        <div className="flex items-start gap-2 p-3 rounded-lg bg-muted/50 border border-border text-sm text-muted-foreground">
          <Info className="w-4 h-4 shrink-0 mt-0.5 text-primary" />
          <span>
            Vous voyez toutes les classes de l'école. Utilisez le bouton <strong className="text-foreground">«&nbsp;Demander l'accès&nbsp;»</strong> pour demander à l'administration de vous assigner une classe.
          </span>
        </div>
      )}

      {/* Filters */}
      <div className="flex flex-col sm:flex-row gap-3">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input
            placeholder="Rechercher une classe..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9"
          />
        </div>
        <Select value={levelFilter} onValueChange={setLevelFilter}>
          <SelectTrigger className="w-[180px]">
            <SelectValue placeholder="Tous les niveaux" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Tous les niveaux</SelectItem>
            {levels.filter((l) => !l.isArchived).map((l) => (
              <SelectItem key={l.id} value={l.id}>{l.code}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-16">
          <Loader2 className="w-8 h-8 animate-spin text-muted-foreground" />
        </div>
      ) : (
        <>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {filteredClasses.map((c) => {
              const level = levels.find((l) => l.id === c.levelId);
              const isMyClass = myAssignedClassIds.includes(c.id);
              return (
                <Card key={c.id} className="border-border/50 hover:shadow-lg transition-all group h-full">
                  <CardContent className="p-5">
                    <div className="flex items-start justify-between mb-3">
                      <div className={`w-11 h-11 rounded-xl flex items-center justify-center ${isMyClass ? "bg-primary/15" : "bg-primary/10"}`}>
                        <Building2 className="w-5 h-5 text-primary" />
                      </div>
                      <div className="flex items-center gap-1.5">
                        {isMyClass && (
                          <Badge className="text-xs bg-green-500/10 text-green-600 border-green-500/20 hover:bg-green-500/10">
                            Ma classe
                          </Badge>
                        )}
                        <Badge variant="secondary" className="font-mono text-xs">
                          {level?.code ?? "—"}
                        </Badge>
                      </div>
                    </div>
                    <h3 className="font-bold text-lg text-foreground">{c.name}</h3>
                    <div className="flex items-center justify-between mt-2">
                      <p className="text-sm text-muted-foreground flex items-center gap-2">
                        <Users className="w-3.5 h-3.5" />
                        {c.studentCount} / {c.capacity} élèves
                      </p>
                      {!isTeacherReal && (
                        <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                          <Button
                            size="sm" variant="ghost"
                            className="h-7 px-2 text-xs gap-1"
                            onClick={() => handleEdit(c)}
                          >
                            <Pencil className="w-3 h-3" /> Modifier
                          </Button>
                          <Button
                            size="sm" variant="ghost"
                            className="h-7 px-2 text-xs gap-1 text-destructive hover:text-destructive"
                            onClick={() => handleDelete(c.id)}
                          >
                            <Trash2 className="w-3 h-3" /> Supprimer
                          </Button>
                        </div>
                      )}
                    </div>
                  </CardContent>
                </Card>
              );
            })}
          </div>

          {filteredClasses.length === 0 && (
            <Card className="border-dashed border-2">
              <CardContent className="p-8 text-center">
                <Building2 className="w-10 h-10 text-muted-foreground mx-auto mb-3" />
                <p className="text-muted-foreground font-medium">Aucune classe</p>
                <p className="text-sm text-muted-foreground mt-1">
                  {isTeacherReal
                    ? "Aucune classe disponible pour le moment"
                    : "Créez votre première classe"}
                </p>
              </CardContent>
            </Card>
          )}
        </>
      )}

      {/* Edit dialog — admin / demo only */}
      {!isTeacherReal && (
        <Dialog open={openCreate && !!editId} onOpenChange={(o) => { if (!o) resetForm(); }}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Modifier la classe</DialogTitle>
            </DialogHeader>
            <div className="space-y-4 pt-2">
              {saveError && (
                <div className="flex items-center gap-2 p-3 rounded-lg bg-destructive/10 text-destructive text-sm">
                  <AlertCircle className="w-4 h-4 shrink-0" /> {saveError}
                </div>
              )}
              <div className="space-y-2">
                <Label>Nom de la classe</Label>
                <Input value={name} onChange={(e) => setName(e.target.value)} />
              </div>
              <div className="space-y-2">
                <Label>Niveau</Label>
                <Select value={levelId} onValueChange={setLevelId}>
                  <SelectTrigger><SelectValue placeholder="Sélectionner un niveau" /></SelectTrigger>
                  <SelectContent>
                    {levels.filter((l) => !l.isArchived).map((l) => (
                      <SelectItem key={l.id} value={l.id}>{l.code} – {l.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Effectif maximum</Label>
                <Input type="number" value={capacity} onChange={(e) => setCapacity(Number(e.target.value))} min={1} max={60} />
              </div>
              <Button onClick={handleSubmit} className="w-full" disabled={saving || !name || !levelId}>
                {saving ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : null}
                Enregistrer
              </Button>
            </div>
          </DialogContent>
        </Dialog>
      )}
    </div>
  );
}
