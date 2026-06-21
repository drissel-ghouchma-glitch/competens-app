import { useState, useEffect, useCallback } from "react";
import { supabase } from "@/lib/supabase";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import {
  CheckCircle2, XCircle, Clock, UserCog, RefreshCw, Building2, Loader2,
} from "lucide-react";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription,
} from "@/components/ui/dialog";
import { toast } from "sonner";

interface PendingProfile {
  id: string;
  email: string;
  full_name: string;
  phone: string | null;
  status: string;
  created_at: string;
}

interface ClassOption {
  id: string;
  name: string;
  levelCode?: string;
}

export default function PendingTeachersPage() {
  const [profiles, setProfiles] = useState<PendingProfile[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState<string | null>(null);

  // Assign-classes dialog state
  const [assignTarget, setAssignTarget] = useState<PendingProfile | null>(null);
  const [allClasses, setAllClasses] = useState<ClassOption[]>([]);
  const [selectedClassIds, setSelectedClassIds] = useState<string[]>([]);
  const [classesLoading, setClassesLoading] = useState(false);
  const [assignError, setAssignError] = useState("");

  const fetchPending = useCallback(async () => {
    if (!supabase) { toast.error("Supabase non configuré."); setIsLoading(false); return; }
    setIsLoading(true);
    const { data, error } = await supabase
      .from("profiles")
      .select("id, email, full_name, phone, status, created_at")
      .eq("role", "professeur")
      .in("status", ["pending", "suspended"])
      .order("created_at", { ascending: false });

    if (error) {
      toast.error(`Erreur: ${error.message}`);
    } else {
      setProfiles(data ?? []);
    }
    setIsLoading(false);
  }, []);

  useEffect(() => { fetchPending(); }, [fetchPending]);

  // Open assign dialog — also fetch all classes
  const openAssignDialog = useCallback(async (profile: PendingProfile) => {
    if (!supabase) return;
    setAssignTarget(profile);
    setSelectedClassIds([]);
    setAssignError("");
    setClassesLoading(true);

    const { data, error } = await supabase
      .from("classes")
      .select("id, name, levels(code)")
      .eq("is_archived", false)
      .order("name");

    if (error) {
      setAssignError("Impossible de charger les classes.");
    } else {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      setAllClasses((data ?? []).map((c: any) => ({
        id: c.id,
        name: c.name,
        levelCode: c.levels?.code,
      })));
    }
    setClassesLoading(false);
  }, []);

  const toggleClass = (id: string) => {
    setSelectedClassIds((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]
    );
  };

  // Approve + assign classes
  const handleApproveAndAssign = async () => {
    if (!supabase || !assignTarget) return;
    setActionLoading(assignTarget.id);
    setAssignError("");
    try {
      // 1. Activate the teacher account
      const { error: e1 } = await supabase
        .from("profiles")
        .update({ status: "active" })
        .eq("id", assignTarget.id);
      if (e1) throw new Error(e1.message);

      // 2. Assign selected classes (if any)
      if (selectedClassIds.length > 0) {
        const rows = selectedClassIds.map((cId) => ({
          teacher_id: assignTarget.id,
          class_id: cId,
        }));
        const { error: e2 } = await supabase
          .from("teacher_class_assignments")
          .upsert(rows, { onConflict: "teacher_id,class_id", ignoreDuplicates: true });
        if (e2) throw new Error(e2.message);
      }

      toast.success(`${assignTarget.full_name} activé${selectedClassIds.length > 0 ? ` et assigné à ${selectedClassIds.length} classe(s)` : ""}.`);
      setAssignTarget(null);
      setProfiles((prev) => prev.filter((p) => p.id !== assignTarget.id));
    } catch (e: unknown) {
      setAssignError(e instanceof Error ? e.message : "Erreur");
    } finally {
      setActionLoading(null);
    }
  };

  const suspendTeacher = async (id: string) => {
    if (!supabase) return;
    setActionLoading(id);
    const { error } = await supabase.from("profiles").update({ status: "suspended" }).eq("id", id);
    if (error) {
      toast.error("Erreur lors de la suspension.");
    } else {
      toast.success("Compte suspendu.");
      setProfiles((prev) => prev.filter((p) => p.id !== id));
    }
    setActionLoading(null);
  };

  const reactivate = async (id: string) => {
    if (!supabase) return;
    setActionLoading(id);
    const { error } = await supabase.from("profiles").update({ status: "active" }).eq("id", id);
    if (error) {
      toast.error("Erreur lors de la réactivation.");
    } else {
      toast.success("Compte réactivé.");
      setProfiles((prev) => prev.filter((p) => p.id !== id));
    }
    setActionLoading(null);
  };

  const pendingList = profiles.filter((p) => p.status === "pending");
  const suspendedList = profiles.filter((p) => p.status === "suspended");

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground flex items-center gap-2">
            <UserCog className="w-6 h-6 text-primary" />
            Demandes d'inscription
          </h1>
          <p className="text-muted-foreground text-sm mt-1">
            Validez les comptes et assignez les classes aux enseignants.
          </p>
        </div>
        <Button variant="outline" size="sm" onClick={fetchPending} disabled={isLoading}>
          <RefreshCw className={`w-4 h-4 mr-2 ${isLoading ? "animate-spin" : ""}`} />
          Actualiser
        </Button>
      </div>

      {isLoading ? (
        <div className="flex items-center justify-center h-40">
          <Loader2 className="w-8 h-8 animate-spin text-muted-foreground" />
        </div>
      ) : pendingList.length === 0 && suspendedList.length === 0 ? (
        <div className="flex flex-col items-center justify-center h-40 gap-3 text-muted-foreground">
          <CheckCircle2 className="w-10 h-10 text-green-400" />
          <p className="text-sm">Aucune demande en attente.</p>
        </div>
      ) : (
        <>
          {pendingList.length > 0 && (
            <div className="space-y-3">
              <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide flex items-center gap-2">
                <Clock className="w-4 h-4 text-orange-400" />
                En attente ({pendingList.length})
              </h2>
              {pendingList.map((p) => (
                <Card key={p.id} className="border-border/60">
                  <CardContent className="p-4 flex items-center justify-between gap-4 flex-wrap">
                    <div className="space-y-0.5">
                      <p className="font-semibold text-foreground">{p.full_name}</p>
                      <p className="text-sm text-muted-foreground">{p.email}</p>
                      {p.phone && <p className="text-xs text-muted-foreground">{p.phone}</p>}
                      <p className="text-xs text-muted-foreground">
                        Inscrit le {new Date(p.created_at).toLocaleDateString("fr-FR", { day: "2-digit", month: "long", year: "numeric" })}
                      </p>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      <Badge variant="secondary">En attente</Badge>
                      <Button
                        size="sm"
                        onClick={() => openAssignDialog(p)}
                        disabled={!!actionLoading}
                        className="bg-green-600 hover:bg-green-700 text-white gap-1"
                      >
                        <Building2 className="w-3.5 h-3.5" /> Approuver &amp; Assigner
                      </Button>
                      <Button
                        size="sm"
                        variant="destructive"
                        onClick={() => suspendTeacher(p.id)}
                        disabled={!!actionLoading}
                        className="gap-1"
                      >
                        <XCircle className="w-3.5 h-3.5" /> Refuser
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}

          {suspendedList.length > 0 && (
            <div className="space-y-3">
              <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide flex items-center gap-2">
                <XCircle className="w-4 h-4 text-destructive" />
                Suspendus ({suspendedList.length})
              </h2>
              {suspendedList.map((p) => (
                <Card key={p.id} className="border-border/60">
                  <CardContent className="p-4 flex items-center justify-between gap-4 flex-wrap">
                    <div className="space-y-0.5">
                      <p className="font-semibold text-foreground">{p.full_name}</p>
                      <p className="text-sm text-muted-foreground">{p.email}</p>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      <Badge variant="destructive">Suspendu</Badge>
                      <Button
                        size="sm"
                        onClick={() => reactivate(p.id)}
                        disabled={!!actionLoading}
                        className="bg-green-600 hover:bg-green-700 text-white gap-1"
                      >
                        <CheckCircle2 className="w-3.5 h-3.5" /> Réactiver
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </>
      )}

      {/* Assign Classes Dialog */}
      <Dialog open={!!assignTarget} onOpenChange={(o) => { if (!o) setAssignTarget(null); }}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Building2 className="w-5 h-5 text-primary" />
              Approuver &amp; Assigner des classes
            </DialogTitle>
            <DialogDescription>
              {assignTarget?.full_name} — choisissez les classes à lui attribuer (optionnel).
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 pt-2">
            {assignError && (
              <div className="p-3 rounded-lg bg-destructive/10 text-destructive text-sm">{assignError}</div>
            )}

            {classesLoading ? (
              <div className="flex justify-center py-6">
                <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
              </div>
            ) : allClasses.length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-4">
                Aucune classe disponible — créez des classes d'abord.
              </p>
            ) : (
              <div className="max-h-64 overflow-y-auto space-y-2 pr-1">
                {allClasses.map((cls) => (
                  <div key={cls.id} className="flex items-center gap-3 p-2 rounded-lg hover:bg-muted/40 cursor-pointer"
                    onClick={() => toggleClass(cls.id)}>
                    <Checkbox
                      checked={selectedClassIds.includes(cls.id)}
                      onCheckedChange={() => toggleClass(cls.id)}
                      id={`cls-${cls.id}`}
                    />
                    <Label htmlFor={`cls-${cls.id}`} className="cursor-pointer flex-1 flex items-center gap-2">
                      <span className="font-medium">{cls.name}</span>
                      {cls.levelCode && (
                        <Badge variant="secondary" className="text-xs font-mono">{cls.levelCode}</Badge>
                      )}
                    </Label>
                  </div>
                ))}
              </div>
            )}

            {selectedClassIds.length > 0 && (
              <p className="text-xs text-primary font-medium">
                {selectedClassIds.length} classe(s) sélectionnée(s)
              </p>
            )}

            <div className="flex gap-2 justify-end pt-2">
              <Button variant="outline" onClick={() => setAssignTarget(null)} disabled={!!actionLoading}>
                Annuler
              </Button>
              <Button
                onClick={handleApproveAndAssign}
                disabled={!!actionLoading}
                className="bg-green-600 hover:bg-green-700 text-white"
              >
                {actionLoading ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : <CheckCircle2 className="w-4 h-4 mr-2" />}
                Confirmer l'activation
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
