import { useState } from "react";
import { useAppStore } from "@/stores/app-store";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Calendar, Plus, CheckCircle, Clock, Archive, Edit } from "lucide-react";
import {
  Dialog, DialogContent, DialogDescription,
  DialogHeader, DialogTitle, DialogTrigger,
} from "@/components/ui/dialog";
import type { SchoolYear } from "@/types";

export default function SchoolYearsPage() {
  const schoolYears = useAppStore((s) => s.schoolYears);
  const addSchoolYear = useAppStore((s) => s.addSchoolYear);
  const updateSchoolYear = useAppStore((s) => s.updateSchoolYear);
  const toggleSchoolYearActive = useAppStore((s) => s.toggleSchoolYearActive);
  const closeSchoolYear = useAppStore((s) => s.closeSchoolYear);

  const [open, setOpen] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);
  const [name, setName] = useState("");
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");

  const handleSubmit = () => {
    if (editId) {
      updateSchoolYear(editId, { name, startDate, endDate });
    } else {
      addSchoolYear({ name, startDate, endDate, isActive: schoolYears.length === 0, isClosed: false });
    }
    resetForm();
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
  };

  return (
    <div className="space-y-6 animate-in fade-in duration-500">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Années scolaires</h1>
          <p className="text-sm text-muted-foreground">Gérez les années scolaires de l'établissement</p>
        </div>
        <Dialog open={open} onOpenChange={(o) => { setOpen(o); if (!o) resetForm(); }}>
          <DialogTrigger asChild>
            <Button size="sm" className="gap-2">
              <Plus className="w-4 h-4" /> Nouvelle année
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>{editId ? "Modifier" : "Créer"} une année scolaire</DialogTitle>
              <DialogDescription>Remplissez les informations de l'année scolaire</DialogDescription>
            </DialogHeader>
            <div className="space-y-4 pt-2">
              <div className="space-y-2">
                <Label>Nom</Label>
                <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="2025-2026" />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-2">
                  <Label>Date de début</Label>
                  <Input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} />
                </div>
                <div className="space-y-2">
                  <Label>Date de fin</Label>
                  <Input type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} />
                </div>
              </div>
              <Button onClick={handleSubmit} className="w-full" disabled={!name}>
                {editId ? "Enregistrer" : "Créer l'année"}
              </Button>
            </div>
          </DialogContent>
        </Dialog>
      </div>

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
                    {sy.isClosed && <Badge variant="secondary">Clôturée</Badge>}
                    {sy.isActive && (
                      <Badge className="bg-green-500/10 text-green-600 border-green-500/20 flex items-center gap-1">
                        <CheckCircle className="w-3 h-3" /> Active
                      </Badge>
                    )}
                  </div>
                  <p className="text-sm text-muted-foreground mt-0.5">
                    Du {new Date(sy.startDate).toLocaleDateString("fr-FR")} au {new Date(sy.endDate).toLocaleDateString("fr-FR")}
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-2 self-end sm:self-auto">
                <Button variant="outline" size="sm" onClick={() => handleEdit(sy)} disabled={sy.isClosed}>
                  <Edit className="w-3.5 h-3.5" />
                </Button>
                {!sy.isClosed && !sy.isActive && (
                  <Button variant="outline" size="sm" onClick={() => toggleSchoolYearActive(sy.id)}>
                    Activer
                  </Button>
                )}
                {sy.isActive && (
                  <Button variant="outline" size="sm" onClick={() => closeSchoolYear(sy.id)} className="text-destructive border-destructive/30 hover:bg-destructive/5">
                    <Clock className="w-3.5 h-3.5 mr-1.5" /> Clôturer
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
              <p className="text-muted-foreground font-medium">Aucune année scolaire</p>
              <p className="text-sm text-muted-foreground mt-1">Créez votre première année scolaire</p>
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  );
}
