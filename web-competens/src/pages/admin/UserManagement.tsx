import { useState, useEffect, useCallback } from "react";
import { useAdmin, type AdminUser } from "@/hooks/use-admin";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription,
} from "@/components/ui/dialog";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Users, RefreshCw, Edit, Save, X, Loader2, ShieldCheck, UserCheck,
} from "lucide-react";
import { toast } from "sonner";
import type { Role, UserStatus } from "@/types";

const ROLE_LABELS: Record<Role, string> = {
  admin: "Admin", directeur: "Directeur", professeur: "Enseignant", parent: "Parent",
};
const STATUS_LABELS: Record<UserStatus, string> = {
  active: "Actif", pending: "En attente", suspended: "Suspendu",
};

function roleBadgeClass(role: Role) {
  switch (role) {
    case "admin":     return "bg-violet-500/10 text-violet-600 border-violet-500/20";
    case "directeur": return "bg-blue-500/10 text-blue-600 border-blue-500/20";
    case "professeur":return "bg-emerald-500/10 text-emerald-600 border-emerald-500/20";
    case "parent":    return "bg-amber-500/10 text-amber-600 border-amber-500/20";
  }
}

function statusBadgeVariant(status: UserStatus): "default" | "secondary" | "destructive" {
  switch (status) {
    case "active":    return "default";
    case "pending":   return "secondary";
    case "suspended": return "destructive";
  }
}

// ── Edit User Dialog ───────────────────────────────────────────

interface EditDialogProps {
  user: AdminUser | null;
  onClose: () => void;
  onSave: (id: string, data: { fullName: string; phone: string; role: Role; status: UserStatus }) => Promise<void>;
}

function EditUserDialog({ user, onClose, onSave }: EditDialogProps) {
  const [fullName, setFullName] = useState(user?.fullName ?? "");
  const [phone, setPhone]       = useState(user?.phone ?? "");
  const [role, setRole]         = useState<Role>(user?.role ?? "professeur");
  const [status, setStatus]     = useState<UserStatus>(user?.status ?? "active");
  const [saving, setSaving]     = useState(false);
  const [err, setErr]           = useState("");

  useEffect(() => {
    if (user) {
      setFullName(user.fullName); setPhone(user.phone ?? "");
      setRole(user.role);         setStatus(user.status);
      setErr("");
    }
  }, [user]);

  const handleSave = async () => {
    setSaving(true); setErr("");
    try {
      await onSave(user!.id, { fullName, phone, role, status });
      toast.success("Profil mis à jour.");
      onClose();
    } catch (e: unknown) {
      setErr(e instanceof Error ? e.message : "Erreur");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={!!user} onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2"><Edit className="w-5 h-5 text-primary" /> Modifier l'utilisateur</DialogTitle>
          <DialogDescription>{user?.email}</DialogDescription>
        </DialogHeader>
        <div className="space-y-4 pt-2">
          {err && <p className="text-sm text-destructive">{err}</p>}
          <div className="space-y-2">
            <Label>Nom complet</Label>
            <Input value={fullName} onChange={(e) => setFullName(e.target.value)} />
          </div>
          <div className="space-y-2">
            <Label>Téléphone</Label>
            <Input value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="Optionnel" />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-2">
              <Label>Rôle</Label>
              <Select value={role} onValueChange={(v) => setRole(v as Role)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {(["admin","directeur","professeur","parent"] as Role[]).map((r) => (
                    <SelectItem key={r} value={r}>{ROLE_LABELS[r]}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Statut</Label>
              <Select value={status} onValueChange={(v) => setStatus(v as UserStatus)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {(["active","pending","suspended"] as UserStatus[]).map((s) => (
                    <SelectItem key={s} value={s}>{STATUS_LABELS[s]}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <div className="flex gap-2 justify-end pt-1">
            <Button variant="outline" onClick={onClose} disabled={saving}><X className="w-4 h-4 mr-1.5" /> Annuler</Button>
            <Button onClick={handleSave} disabled={saving || !fullName.trim()}>
              {saving ? <Loader2 className="w-4 h-4 animate-spin mr-1.5" /> : <Save className="w-4 h-4 mr-1.5" />}
              Enregistrer
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

// ── Link Children Dialog ───────────────────────────────────────

interface LinkChildrenDialogProps {
  parent: AdminUser | null;
  onClose: () => void;
  fetchStudents: () => Promise<{ id: string; firstName: string; lastName: string; className?: string }[]>;
  getParentChildren: (parentId: string) => Promise<string[]>;
  setParentChildren: (parentId: string, studentIds: string[]) => Promise<void>;
}

function LinkChildrenDialog({ parent, onClose, fetchStudents, getParentChildren, setParentChildren }: LinkChildrenDialogProps) {
  const [students, setStudents] = useState<{ id: string; firstName: string; lastName: string; className?: string }[]>([]);
  const [selected, setSelected] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState("");

  useEffect(() => {
    if (!parent) return;
    setLoading(true);
    Promise.all([fetchStudents(), getParentChildren(parent.id)])
      .then(([studs, existing]) => { setStudents(studs); setSelected(existing); })
      .catch((e) => setErr(e.message))
      .finally(() => setLoading(false));
  }, [parent, fetchStudents, getParentChildren]);

  const toggle = (id: string) =>
    setSelected((prev) => prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]);

  const handleSave = async () => {
    setSaving(true); setErr("");
    try {
      await setParentChildren(parent!.id, selected);
      toast.success(`${selected.length} enfant(s) associé(s) à ${parent!.fullName}.`);
      onClose();
    } catch (e: unknown) {
      setErr(e instanceof Error ? e.message : "Erreur");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={!!parent} onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2"><UserCheck className="w-5 h-5 text-primary" /> Associer les enfants</DialogTitle>
          <DialogDescription>{parent?.fullName} — sélectionnez les élèves liés à ce parent.</DialogDescription>
        </DialogHeader>
        <div className="space-y-4 pt-2">
          {err && <p className="text-sm text-destructive">{err}</p>}
          {loading ? (
            <div className="flex justify-center py-8"><Loader2 className="w-6 h-6 animate-spin text-muted-foreground" /></div>
          ) : students.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-4">Aucun élève disponible.</p>
          ) : (
            <div className="max-h-64 overflow-y-auto space-y-1 pr-1">
              {students.map((s) => (
                <div key={s.id} className="flex items-center gap-3 p-2 rounded-lg hover:bg-muted/40 cursor-pointer" onClick={() => toggle(s.id)}>
                  <Checkbox checked={selected.includes(s.id)} onCheckedChange={() => toggle(s.id)} id={`st-${s.id}`} />
                  <Label htmlFor={`st-${s.id}`} className="cursor-pointer flex-1 flex items-center justify-between gap-2">
                    <span className="font-medium text-sm">{s.firstName} {s.lastName}</span>
                    {s.className && <Badge variant="secondary" className="text-xs">{s.className}</Badge>}
                  </Label>
                </div>
              ))}
            </div>
          )}
          {selected.length > 0 && (
            <p className="text-xs text-primary font-medium">{selected.length} élève(s) sélectionné(s)</p>
          )}
          <div className="flex gap-2 justify-end pt-1">
            <Button variant="outline" onClick={onClose} disabled={saving}><X className="w-4 h-4 mr-1.5" /> Annuler</Button>
            <Button onClick={handleSave} disabled={saving || loading} className="bg-green-600 hover:bg-green-700 text-white">
              {saving ? <Loader2 className="w-4 h-4 animate-spin mr-1.5" /> : <Save className="w-4 h-4 mr-1.5" />}
              Enregistrer
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

// ── User Row ───────────────────────────────────────────────────

function UserRow({ user, onEdit, onLinkChildren }: {
  user: AdminUser;
  onEdit: (u: AdminUser) => void;
  onLinkChildren?: (u: AdminUser) => void;
}) {
  return (
    <Card className="border-border/60">
      <CardContent className="p-4 flex items-center justify-between gap-4 flex-wrap">
        <div className="space-y-0.5">
          <div className="flex items-center gap-2 flex-wrap">
            <p className="font-semibold text-foreground text-sm">{user.fullName}</p>
            <Badge className={roleBadgeClass(user.role)}>{ROLE_LABELS[user.role]}</Badge>
            <Badge variant={statusBadgeVariant(user.status)} className="text-xs">{STATUS_LABELS[user.status]}</Badge>
          </div>
          <p className="text-xs text-muted-foreground">{user.email}</p>
          {user.phone && <p className="text-xs text-muted-foreground">{user.phone}</p>}
        </div>
        <div className="flex items-center gap-2 shrink-0">
          {onLinkChildren && user.role === "parent" && (
            <Button size="sm" variant="outline" onClick={() => onLinkChildren(user)} className="gap-1.5">
              <UserCheck className="w-3.5 h-3.5" /> Associer enfants
            </Button>
          )}
          <Button size="sm" variant="outline" onClick={() => onEdit(user)} className="gap-1.5">
            <Edit className="w-3.5 h-3.5" /> Modifier
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

// ── Main Page ──────────────────────────────────────────────────

export default function UserManagementPage() {
  const { users, loading, fetchUsers, updateUser, fetchStudents, getParentChildren, setParentChildren } = useAdmin();
  const [editTarget, setEditTarget]   = useState<AdminUser | null>(null);
  const [linkTarget, setLinkTarget]   = useState<AdminUser | null>(null);
  const [tab, setTab] = useState("all");

  useEffect(() => { fetchUsers(); }, [fetchUsers]);

  const handleSave = useCallback(async (id: string, data: { fullName: string; phone: string; role: Role; status: UserStatus }) => {
    await updateUser(id, data);
    await fetchUsers();
  }, [updateUser, fetchUsers]);

  const filterByTab = (list: AdminUser[], t: string) => {
    if (t === "all") return list;
    return list.filter((u) => u.role === t);
  };

  const displayed = filterByTab(users, tab);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <ShieldCheck className="w-6 h-6 text-primary" /> Gestion des utilisateurs
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            Modifiez les profils, rôles et statuts de tous les utilisateurs.
          </p>
        </div>
        <Button variant="outline" size="sm" onClick={() => fetchUsers()} disabled={loading}>
          <RefreshCw className={`w-4 h-4 mr-2 ${loading ? "animate-spin" : ""}`} /> Actualiser
        </Button>
      </div>

      <Tabs value={tab} onValueChange={setTab}>
        <TabsList className="mb-4">
          <TabsTrigger value="all">Tous ({users.length})</TabsTrigger>
          <TabsTrigger value="admin">Admins ({users.filter((u) => u.role === "admin").length})</TabsTrigger>
          <TabsTrigger value="directeur">Directeurs ({users.filter((u) => u.role === "directeur").length})</TabsTrigger>
          <TabsTrigger value="professeur">Enseignants ({users.filter((u) => u.role === "professeur").length})</TabsTrigger>
          <TabsTrigger value="parent">Parents ({users.filter((u) => u.role === "parent").length})</TabsTrigger>
        </TabsList>

        {["all","admin","directeur","professeur","parent"].map((t) => (
          <TabsContent key={t} value={t}>
            {loading ? (
              <div className="flex justify-center py-12"><Loader2 className="w-6 h-6 animate-spin text-muted-foreground" /></div>
            ) : displayed.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-12 gap-2 text-muted-foreground">
                <Users className="w-10 h-10" />
                <p className="text-sm">Aucun utilisateur dans cette catégorie.</p>
              </div>
            ) : (
              <div className="space-y-2">
                {displayed.map((u) => (
                  <UserRow
                    key={u.id}
                    user={u}
                    onEdit={setEditTarget}
                    onLinkChildren={setLinkTarget}
                  />
                ))}
              </div>
            )}
          </TabsContent>
        ))}
      </Tabs>

      <EditUserDialog
        user={editTarget}
        onClose={() => setEditTarget(null)}
        onSave={handleSave}
      />

      <LinkChildrenDialog
        parent={linkTarget}
        onClose={() => setLinkTarget(null)}
        fetchStudents={fetchStudents}
        getParentChildren={getParentChildren}
        setParentChildren={setParentChildren}
      />
    </div>
  );
}
