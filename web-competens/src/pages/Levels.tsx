import { useState } from "react";
import { useAppStore } from "@/stores/app-store";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { GraduationCap, Plus, Edit, Archive, ArrowUpRight } from "lucide-react";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import type { Level } from "@/types";

export default function LevelsPage() {
  const levels = useAppStore((s) => s.levels);
  const addLevel = useAppStore((s) => s.addLevel);
  const updateLevel = useAppStore((s) => s.updateLevel);
  const archiveLevel = useAppStore((s) => s.archiveLevel);

  const [open, setOpen] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);
  const [name, setName] = useState("");
  const [code, setCode] = useState("");

  const handleSubmit = () => {
    if (editId) {
      updateLevel(editId, { name, code });
    } else {
      addLevel({ name, code, isArchived: false });
    }
    resetForm();
  };

  const handleEdit = (l: Level) => {
    setEditId(l.id);
    setName(l.name);
    setCode(l.code);
    setOpen(true);
  };

  const resetForm = () => {
    setOpen(false);
    setEditId(null);
    setName("");
    setCode("");
  };

  const activeLevels = levels.filter((l) => !l.isArchived);
  const archivedLevels = levels.filter((l) => l.isArchived);

  return (
    <div className="space-y-6 animate-in fade-in duration-500">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Niveaux</h1>
          <p className="text-sm text-muted-foreground">Gestion des niveaux d'enseignement</p>
        </div>
        <Dialog open={open} onOpenChange={(o) => { setOpen(o); if (!o) resetForm(); }}>
          <DialogTrigger asChild>
            <Button size="sm" className="gap-2">
              <Plus className="w-4 h-4" /> Ajouter un niveau
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>{editId ? "Modifier" : "Ajouter"} un niveau</DialogTitle>
              <DialogDescription>Définissez le nom et le code du niveau</DialogDescription>
            </DialogHeader>
            <div className="space-y-4 pt-2">
              <div className="space-y-2">
                <Label>Code</Label>
                <Input value={code} onChange={(e) => setCode(e.target.value)} placeholder="CP1" />
              </div>
              <div className="space-y-2">
                <Label>Nom</Label>
                <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Cours Préparatoire 1" />
              </div>
              <Button onClick={handleSubmit} className="w-full" disabled={!name || !code}>
                {editId ? "Enregistrer" : "Ajouter"}
              </Button>
            </div>
          </DialogContent>
        </Dialog>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-3">
        {activeLevels.map((level) => (
          <Card key={level.id} className="border-border/50 hover:shadow-md hover:-translate-y-0.5 transition-all group cursor-pointer">
            <CardContent className="p-4 text-center">
              <div className="w-12 h-12 rounded-2xl bg-primary/10 flex items-center justify-center mx-auto mb-3 group-hover:bg-primary/20 transition-colors">
                <GraduationCap className="w-6 h-6 text-primary" />
              </div>
              <h3 className="font-bold text-lg text-foreground font-mono">{level.code}</h3>
              <p className="text-xs text-muted-foreground mt-1">{level.name}</p>
              <div className="flex items-center justify-center gap-1 mt-3 opacity-0 group-hover:opacity-100 transition-opacity">
                <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => handleEdit(level)}>
                  <Edit className="w-3.5 h-3.5" />
                </Button>
                <Button variant="ghost" size="icon" className="h-7 w-7 text-destructive" onClick={() => archiveLevel(level.id)}>
                  <Archive className="w-3.5 h-3.5" />
                </Button>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {archivedLevels.length > 0 && (
        <div>
          <h2 className="text-sm font-semibold text-muted-foreground mb-3">Archivés</h2>
          <div className="flex flex-wrap gap-2">
            {archivedLevels.map((l) => (
              <Badge key={l.id} variant="secondary" className="gap-1 cursor-pointer" onClick={() => archiveLevel(l.id)}>
                {l.code} <ArrowUpRight className="w-3 h-3" />
              </Badge>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
