import { useState } from "react";
import { useRequests } from "@/hooks/use-requests";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  CheckCircle2, XCircle, RefreshCw, Loader2, ClipboardList,
  Users, BookOpen, Building2, AlertCircle,
} from "lucide-react";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription,
} from "@/components/ui/dialog";
import type { AdminRequest, RequestType } from "@/hooks/use-requests";

const typeConfig: Record<RequestType, { label: string; icon: typeof Users; color: string }> = {
  add_student:    { label: "Ajout élève",     icon: Users,        color: "text-blue-500 bg-blue-500/10" },
  add_competency: { label: "Ajout compétence", icon: BookOpen,     color: "text-violet-500 bg-violet-500/10" },
  assign_class:   { label: "Accès classe",     icon: Building2,    color: "text-emerald-500 bg-emerald-500/10" },
};

function RequestSummary({ request }: { request: AdminRequest }) {
  const d = request.data;
  if (request.type === "add_student") {
    return (
      <div className="text-sm space-y-0.5">
        <p><span className="text-muted-foreground">Élève :</span> <strong>{String(d.firstName)} {String(d.lastName)}</strong></p>
        {d.birthDate && <p><span className="text-muted-foreground">Naissance :</span> {String(d.birthDate)}</p>}
        <p><span className="text-muted-foreground">Sexe :</span> {d.gender === "F" ? "Féminin" : "Masculin"}</p>
      </div>
    );
  }
  if (request.type === "add_competency") {
    return (
      <div className="text-sm space-y-0.5">
        <p><span className="text-muted-foreground">Code :</span> <strong className="font-mono">{String(d.code)}</strong></p>
        <p><span className="text-muted-foreground">Titre :</span> {String(d.title)}</p>
        {d.description && <p className="text-muted-foreground text-xs line-clamp-2">{String(d.description)}</p>}
      </div>
    );
  }
  if (request.type === "assign_class") {
    const ids = (d.classIds as string[] | undefined) ?? [];
    return (
      <div className="text-sm">
        <p><span className="text-muted-foreground">Classes demandées :</span> <strong>{ids.length}</strong></p>
        <p className="text-xs text-muted-foreground font-mono">{ids.join(", ").substring(0, 80)}{ids.join(", ").length > 80 ? "…" : ""}</p>
      </div>
    );
  }
  return null;
}

export default function AdminRequestsPage() {
  const { requests, loading, error, fetchRequests, approveRequest, rejectRequest } = useRequests();
  const [actionId, setActionId] = useState<string | null>(null);
  const [rejectTarget, setRejectTarget] = useState<AdminRequest | null>(null);
  const [rejectNote, setRejectNote] = useState("");
  const [saveError, setSaveError] = useState("");

  const handleApprove = async (req: AdminRequest) => {
    setSaveError("");
    setActionId(req.id + "_approve");
    try {
      await approveRequest(req);
    } catch (e: unknown) {
      setSaveError(e instanceof Error ? e.message : "Erreur lors de l'approbation");
    } finally {
      setActionId(null);
    }
  };

  const handleReject = async () => {
    if (!rejectTarget) return;
    setSaveError("");
    setActionId(rejectTarget.id + "_reject");
    try {
      await rejectRequest(rejectTarget.id, rejectNote || undefined);
      setRejectTarget(null);
      setRejectNote("");
    } catch (e: unknown) {
      setSaveError(e instanceof Error ? e.message : "Erreur lors du rejet");
    } finally {
      setActionId(null);
    }
  };

  return (
    <div className="space-y-6 animate-in fade-in duration-500">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight flex items-center gap-2">
            <ClipboardList className="w-6 h-6 text-primary" />
            Demandes en attente
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            {loading ? "Chargement…" : `${requests.length} demande${requests.length !== 1 ? "s" : ""} à traiter`}
          </p>
        </div>
        <Button variant="outline" size="sm" onClick={fetchRequests} disabled={loading}>
          <RefreshCw className={`w-4 h-4 mr-2 ${loading ? "animate-spin" : ""}`} />
          Actualiser
        </Button>
      </div>

      {error && (
        <div className="flex items-center gap-2 p-3 rounded-lg bg-destructive/10 text-destructive text-sm">
          <AlertCircle className="w-4 h-4 shrink-0" /> {error}
        </div>
      )}

      {saveError && (
        <div className="flex items-center gap-2 p-3 rounded-lg bg-destructive/10 text-destructive text-sm">
          <AlertCircle className="w-4 h-4 shrink-0" /> {saveError}
        </div>
      )}

      {loading ? (
        <div className="flex items-center justify-center py-16">
          <Loader2 className="w-8 h-8 animate-spin text-muted-foreground" />
        </div>
      ) : requests.length === 0 ? (
        <Card className="border-dashed border-2">
          <CardContent className="p-10 text-center">
            <CheckCircle2 className="w-12 h-12 text-green-400 mx-auto mb-3" />
            <p className="font-medium text-muted-foreground">Aucune demande en attente</p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-3">
          {requests.map((req) => {
            const cfg = typeConfig[req.type];
            const Icon = cfg.icon;
            const isActing = actionId?.startsWith(req.id);
            return (
              <Card key={req.id} className="border-border/60">
                <CardContent className="p-4">
                  <div className="flex items-start gap-4 flex-wrap">
                    {/* Type badge */}
                    <div className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 ${cfg.color}`}>
                      <Icon className="w-5 h-5" />
                    </div>

                    {/* Info */}
                    <div className="flex-1 min-w-0 space-y-2">
                      <div className="flex items-center gap-2 flex-wrap">
                        <Badge variant="secondary" className="text-xs">{cfg.label}</Badge>
                        <span className="text-sm font-medium">{req.teacherName}</span>
                        <span className="text-xs text-muted-foreground">{req.teacherEmail}</span>
                        <span className="text-xs text-muted-foreground ml-auto">
                          {new Date(req.createdAt).toLocaleDateString("fr-FR", { day: "2-digit", month: "short", year: "numeric" })}
                        </span>
                      </div>
                      <RequestSummary request={req} />
                    </div>

                    {/* Actions */}
                    <div className="flex gap-2 shrink-0">
                      <Button
                        size="sm"
                        className="bg-green-600 hover:bg-green-700 text-white gap-1"
                        disabled={!!isActing}
                        onClick={() => handleApprove(req)}
                      >
                        {isActing && actionId?.endsWith("_approve") ? (
                          <Loader2 className="w-3.5 h-3.5 animate-spin" />
                        ) : (
                          <CheckCircle2 className="w-3.5 h-3.5" />
                        )}
                        Approuver
                      </Button>
                      <Button
                        size="sm"
                        variant="destructive"
                        disabled={!!isActing}
                        onClick={() => { setRejectTarget(req); setRejectNote(""); setSaveError(""); }}
                        className="gap-1"
                      >
                        <XCircle className="w-3.5 h-3.5" /> Refuser
                      </Button>
                    </div>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      {/* Reject dialog */}
      <Dialog open={!!rejectTarget} onOpenChange={(o) => { if (!o) setRejectTarget(null); }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Refuser la demande</DialogTitle>
            <DialogDescription>
              Vous pouvez ajouter une note pour l'enseignant (optionnel).
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 pt-2">
            <div className="space-y-2">
              <Label>Note pour l'enseignant</Label>
              <Input
                value={rejectNote}
                onChange={(e) => setRejectNote(e.target.value)}
                placeholder="Raison du refus (optionnel)"
              />
            </div>
            <div className="flex gap-2 justify-end">
              <Button variant="outline" onClick={() => setRejectTarget(null)}>Annuler</Button>
              <Button
                variant="destructive"
                onClick={handleReject}
                disabled={!!actionId}
              >
                {actionId ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : null}
                Confirmer le refus
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
