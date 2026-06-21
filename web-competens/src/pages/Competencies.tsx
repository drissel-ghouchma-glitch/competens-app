import { useState, useMemo } from "react";
import { useCompetencies } from "@/hooks/use-competencies";
import { useRequests } from "@/hooks/use-requests";
import { useAuth } from "@/hooks/use-auth";
import { useDemoStore } from "@/stores/demo";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { BookOpen, Plus, Edit, Lightbulb, ChevronDown, ChevronUp, Search, Loader2, AlertCircle, Info, Send } from "lucide-react";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { ScrollArea } from "@/components/ui/scroll-area";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import type { Competency } from "@/types";

export default function CompetenciesPage() {
  const { competencies, loading, error, addCompetency, updateCompetency } = useCompetencies();
  const { submitRequest } = useRequests();
  const { user } = useAuth();
  const isDemo = useDemoStore((s) => s.isDemoMode);
  const isTeacherReal = !isDemo && user?.role === "professeur";

  const [open, setOpen] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);
  const [code, setCode] = useState("");
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [advice, setAdvice] = useState("");
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});
  const [search, setSearch] = useState("");
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState("");

  const sorted = useMemo(() => {
    let list = [...competencies].sort((a, b) => a.order - b.order);
    if (search) {
      const q = search.toLowerCase();
      list = list.filter((c) =>
        c.code.toLowerCase().includes(q) ||
        c.title.toLowerCase().includes(q) ||
        c.description.toLowerCase().includes(q)
      );
    }
    return list;
  }, [competencies, search]);

  const handleSubmit = async () => {
    setSaveError("");
    setSaving(true);
    try {
      if (editId) {
        await updateCompetency(editId, { code, title, description, pedagogicalAdvice: advice });
      } else if (isTeacherReal) {
        await submitRequest("add_competency", {
          code, title, description, pedagogicalAdvice: advice,
          order: competencies.length + 1,
        });
        toast.success("Demande envoyée à l'administration pour approbation.");
      } else {
        await addCompetency({
          code, title, description, pedagogicalAdvice: advice,
          order: competencies.length + 1,
        });
      }
      resetForm();
    } catch (e: unknown) {
      setSaveError(e instanceof Error ? e.message : "Erreur lors de l'enregistrement");
    } finally {
      setSaving(false);
    }
  };

  const handleEdit = (c: Competency) => {
    setEditId(c.id);
    setCode(c.code);
    setTitle(c.title);
    setDescription(c.description);
    setAdvice(c.pedagogicalAdvice);
    setSaveError("");
    setOpen(true);
  };

  const resetForm = () => {
    setOpen(false);
    setEditId(null);
    setCode("");
    setTitle("");
    setDescription("");
    setAdvice("");
    setSaveError("");
  };

  const toggleExpand = (id: string) => {
    setExpanded((prev) => ({ ...prev, [id]: !prev[id] }));
  };

  return (
    <div className="space-y-6 animate-in fade-in duration-500">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Compétences</h1>
          <p className="text-sm text-muted-foreground">
            {loading ? "Chargement…" : `${competencies.length} compétence${competencies.length !== 1 ? "s" : ""} dans le référentiel`}
          </p>
        </div>
        <Dialog open={open} onOpenChange={(o) => { setOpen(o); if (!o) resetForm(); }}>
          <DialogTrigger asChild>
            <Button size="sm" className="gap-2">
              {isTeacherReal ? <Send className="w-4 h-4" /> : <Plus className="w-4 h-4" />}
              {isTeacherReal ? "Demander l'ajout" : "Ajouter une compétence"}
            </Button>
          </DialogTrigger>
          <DialogContent className="max-w-md">
            <DialogHeader>
              <DialogTitle>{editId ? "Modifier" : isTeacherReal ? "Demande d'ajout de compétence" : "Ajouter"} {!editId && !isTeacherReal ? "une compétence" : ""}</DialogTitle>
              <DialogDescription>
                {isTeacherReal && !editId
                  ? "Cette demande sera envoyée à l'administration pour approbation."
                  : "Définissez le code, le titre et la description"}
              </DialogDescription>
            </DialogHeader>
            <ScrollArea className="max-h-[60vh]">
              <div className="space-y-4 p-1">
                {isTeacherReal && !editId && (
                  <div className="flex items-start gap-2 p-3 rounded-lg bg-primary/5 border border-primary/20 text-sm text-primary">
                    <Info className="w-4 h-4 shrink-0 mt-0.5" />
                    La demande sera examinée par l'administration avant d'être ajoutée.
                  </div>
                )}
                {saveError && (
                  <div className="flex items-center gap-2 p-3 rounded-lg bg-destructive/10 text-destructive text-sm">
                    <AlertCircle className="w-4 h-4 shrink-0" /> {saveError}
                  </div>
                )}
                <div className="space-y-2">
                  <Label>Code</Label>
                  <Input value={code} onChange={(e) => setCode(e.target.value)} placeholder="C13" />
                </div>
                <div className="space-y-2">
                  <Label>Titre</Label>
                  <Input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Titre de la compétence" />
                </div>
                <div className="space-y-2">
                  <Label>Description</Label>
                  <Textarea
                    value={description}
                    onChange={(e) => setDescription(e.target.value)}
                    placeholder="Description détaillée..."
                    className="min-h-[80px]"
                  />
                </div>
                <div className="space-y-2">
                  <Label>Conseils pédagogiques</Label>
                  <Textarea
                    value={advice}
                    onChange={(e) => setAdvice(e.target.value)}
                    placeholder="Suggestions pour les enseignants..."
                    className="min-h-[80px]"
                  />
                </div>
                <Button onClick={handleSubmit} className="w-full" disabled={saving || !code || !title}>
                  {saving ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : null}
                  {editId ? "Enregistrer" : isTeacherReal ? "Envoyer la demande" : "Ajouter"}
                </Button>
              </div>
            </ScrollArea>
          </DialogContent>
        </Dialog>
      </div>

      {error && (
        <div className="flex items-center gap-2 p-3 rounded-lg bg-destructive/10 text-destructive text-sm">
          <AlertCircle className="w-4 h-4 shrink-0" /> {error}
        </div>
      )}

      <div className="relative max-w-md">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
        <Input
          placeholder="Rechercher une compétence..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="pl-9"
        />
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-16">
          <Loader2 className="w-8 h-8 animate-spin text-muted-foreground" />
        </div>
      ) : (
        <div className="grid gap-3">
          {sorted.map((c) => (
            <Card
              key={c.id}
              className={cn(
                "border-border/50 transition-all hover:shadow-md",
                expanded[c.id] && "ring-1 ring-primary/20"
              )}
            >
              <div
                className="p-4 md:p-5 flex items-start gap-4 cursor-pointer"
                onClick={() => toggleExpand(c.id)}
              >
                <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center text-primary font-bold font-mono shrink-0">
                  {c.code}
                </div>
                <div className="flex-1 min-w-0">
                  <h3 className="font-semibold text-foreground">{c.title}</h3>
                  <p className="text-sm text-muted-foreground line-clamp-1 mt-0.5">{c.description}</p>
                </div>
                <div className="flex items-center gap-1 shrink-0">
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-8 w-8"
                    onClick={(e) => { e.stopPropagation(); handleEdit(c); }}
                  >
                    <Edit className="w-4 h-4" />
                  </Button>
                  {expanded[c.id] ? (
                    <ChevronUp className="w-5 h-5 text-muted-foreground" />
                  ) : (
                    <ChevronDown className="w-5 h-5 text-muted-foreground" />
                  )}
                </div>
              </div>

              {expanded[c.id] && (
                <div className="px-5 pb-5 space-y-3 animate-in fade-in slide-in-from-top-2 duration-200">
                  <div>
                    <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-1">Description</h4>
                    <p className="text-sm text-foreground">{c.description}</p>
                  </div>
                  <div className="flex items-start gap-2 p-3 rounded-xl bg-amber-500/5 border border-amber-500/10">
                    <Lightbulb className="w-4 h-4 text-amber-500 shrink-0 mt-0.5" />
                    <div>
                      <h4 className="text-xs font-semibold text-amber-600 mb-1">Conseils pédagogiques</h4>
                      <p className="text-sm text-foreground">{c.pedagogicalAdvice}</p>
                    </div>
                  </div>
                </div>
              )}
            </Card>
          ))}
        </div>
      )}

      {!loading && sorted.length === 0 && (
        <Card className="border-dashed border-2">
          <CardContent className="p-8 text-center">
            <BookOpen className="w-10 h-10 text-muted-foreground mx-auto mb-3" />
            <p className="text-muted-foreground font-medium">Aucune compétence trouvée</p>
            <p className="text-sm text-muted-foreground mt-1">
              Ajoutez des compétences au référentiel
            </p>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
