import { useState } from "react";
import { useParams } from "react-router-dom";
import { useStudentDetail } from "@/hooks/use-student-detail";
import { useAuth } from "@/hooks/use-auth";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Progress } from "@/components/ui/progress";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  Calendar, User, GraduationCap, TrendingUp, Bell,
  CheckCircle, Clock, XCircle, Edit, Save, X, Loader2,
  BarChart2, Eye,
} from "lucide-react";
import {
  ResponsiveContainer, RadarChart, PolarGrid, PolarAngleAxis,
  PolarRadiusAxis, Radar,
} from "recharts";
import type { CompetencyStat } from "@/hooks/use-student-detail";

// ── Helpers ──────────────────────────────────────────────────────────────────

function StatusIcon({ status }: { status: string }) {
  switch (status) {
    case "acquis": return <CheckCircle className="w-4 h-4 text-green-500" />;
    case "en_cours": return <Clock className="w-4 h-4 text-amber-500" />;
    default: return <XCircle className="w-4 h-4 text-red-500" />;
  }
}

function statusLabel(status: string) {
  switch (status) {
    case "acquis": return "Acquis";
    case "en_cours": return "En cours";
    default: return "Non acquis";
  }
}

function acquisitionColor(rate: number) {
  if (rate >= 70) return "hsl(122 39% 49% / 0.15)";
  if (rate >= 40) return "hsl(25 100% 62% / 0.15)";
  return "hsl(4 77% 55% / 0.15)";
}

// ── Stats panels (shared between roles) ──────────────────────────────────────

function RadarPanel({ stats, title }: { stats: CompetencyStat[]; title?: string }) {
  const data = stats.map((s) => ({ subject: s.competencyCode, value: s.acquisitionRate, fullMark: 100 }));
  if (data.length === 0) return (
    <Card className="border-border/50">
      <CardContent className="p-8 text-center text-muted-foreground text-sm">
        Aucune évaluation disponible.
      </CardContent>
    </Card>
  );
  return (
    <Card className="border-border/50">
      <CardHeader className="pb-2">
        <CardTitle className="text-base font-semibold flex items-center gap-2">
          <TrendingUp className="w-4 h-4 text-primary" />
          {title ?? "Radar des compétences"}
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="h-[300px] md:h-[360px]">
          <ResponsiveContainer width="100%" height="100%">
            <RadarChart data={data} cx="50%" cy="50%" outerRadius="75%">
              <PolarGrid stroke="hsl(var(--border))" />
              <PolarAngleAxis dataKey="subject" tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }} />
              <PolarRadiusAxis angle={30} domain={[0, 100]} tick={{ fontSize: 10 }} />
              <Radar name="Taux d'acquisition" dataKey="value" stroke="hsl(220 99% 62%)" fill="hsl(220 99% 62%)" fillOpacity={0.2} />
            </RadarChart>
          </ResponsiveContainer>
        </div>
      </CardContent>
    </Card>
  );
}

function SummaryPanel({ stats }: { stats: CompetencyStat[] }) {
  return (
    <Card className="border-border/50">
      <CardHeader className="pb-2">
        <CardTitle className="text-base font-semibold">Résumé</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        {stats.length === 0 && <p className="text-sm text-muted-foreground">Aucune donnée.</p>}
        {stats.map((s) => (
          <div key={s.competencyCode} className="space-y-1.5">
            <div className="flex items-center justify-between text-xs">
              <span className="font-medium text-foreground">{s.competencyCode}</span>
              <div className="flex items-center gap-1.5">
                <StatusIcon status={s.lastStatus} />
                <span className="text-muted-foreground">{s.acquisitionRate}%</span>
              </div>
            </div>
            <Progress value={s.acquisitionRate} className="h-1.5" />
          </div>
        ))}
      </CardContent>
    </Card>
  );
}

function SkillGrid({ stats }: { stats: CompetencyStat[] }) {
  return (
    <Card className="border-border/50">
      <CardHeader className="pb-2">
        <CardTitle className="text-base font-semibold">Détail par compétence</CardTitle>
      </CardHeader>
      <CardContent>
        {stats.length === 0 && (
          <p className="text-sm text-muted-foreground py-4 text-center">
            Aucune évaluation enregistrée pour cet élève.
          </p>
        )}
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {stats.map((s) => (
            <div key={s.competencyCode} className="flex items-start gap-3 p-3 rounded-xl bg-muted/40">
              <div className="w-10 h-10 rounded-lg flex items-center justify-center shrink-0"
                style={{ backgroundColor: acquisitionColor(s.acquisitionRate) }}>
                <StatusIcon status={s.lastStatus} />
              </div>
              <div className="min-w-0">
                <p className="text-sm font-semibold text-foreground">{s.competencyCode}</p>
                <p className="text-xs text-muted-foreground truncate">{s.competencyTitle}</p>
                <div className="flex items-center gap-2 mt-1.5">
                  <Progress value={s.acquisitionRate} className="h-1 flex-1" />
                  <span className="text-xs font-mono font-medium">{s.acquisitionRate}%</span>
                </div>
                <p className="text-[10px] text-muted-foreground mt-0.5">
                  {s.totalEvaluations} éval. · {statusLabel(s.lastStatus)}
                </p>
              </div>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}

// ── Main Page ─────────────────────────────────────────────────────────────────

export default function StudentDetailPage() {
  const { id } = useParams<{ id: string }>();
  const { user } = useAuth();
  const role = user?.role ?? "admin";

  const {
    student, classe, level, competencies,
    myStats, globalStats, alerts, classes,
    loading, error, updateStudent,
  } = useStudentDetail(id);

  // Admin edit state
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [editFirstName, setEditFirstName] = useState("");
  const [editLastName, setEditLastName] = useState("");
  const [editBirthDate, setEditBirthDate] = useState("");
  const [editGender, setEditGender] = useState<"M" | "F">("M");
  const [editClassId, setEditClassId] = useState("");

  // Admin analytics toggle
  const [showGlobal, setShowGlobal] = useState(false);

  const pendingAlerts = alerts.filter((a) => !a.resolved).length;
  const displayStats = (role !== "professeur" && showGlobal) ? globalStats : myStats;

  const startEdit = () => {
    if (!student) return;
    setEditFirstName(student.firstName);
    setEditLastName(student.lastName);
    setEditBirthDate(student.birthDate);
    setEditGender(student.gender);
    setEditClassId(student.classId);
    setSaveError(null);
    setEditing(true);
  };

  const cancelEdit = () => { setEditing(false); setSaveError(null); };

  const saveEdit = async () => {
    setSaving(true);
    setSaveError(null);
    try {
      await updateStudent({
        firstName: editFirstName,
        lastName: editLastName,
        birthDate: editBirthDate,
        gender: editGender,
        classId: editClassId,
      });
      setEditing(false);
    } catch (e: unknown) {
      setSaveError(e instanceof Error ? e.message : "Erreur lors de la sauvegarde");
    } finally {
      setSaving(false);
    }
  };

  // ── Loading / Error ───────────────────────────────────────

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="rounded-lg border border-destructive/30 bg-destructive/5 p-4 text-sm text-destructive">
        {error}
      </div>
    );
  }

  if (!student) {
    return (
      <div className="text-center py-16 text-muted-foreground text-sm">
        Élève introuvable.
      </div>
    );
  }

  const age = Math.floor(
    (Date.now() - new Date(student.birthDate).getTime()) / (365.25 * 24 * 60 * 60 * 1000)
  );

  // ═════════════════════════════════════════════════════════
  // TEACHER VIEW — read-only, only their own evaluations
  // ═════════════════════════════════════════════════════════
  if (role === "professeur") {
    return (
      <div className="space-y-6 animate-in fade-in duration-500">
        {/* Header */}
        <div className="flex flex-col sm:flex-row gap-4">
          <div className="w-16 h-16 sm:w-20 sm:h-20 rounded-2xl bg-primary/10 flex items-center justify-center text-primary font-bold text-2xl shrink-0">
            {student.firstName[0]}{student.lastName[0]}
          </div>
          <div className="flex-1">
            <h1 className="text-2xl font-bold tracking-tight">{student.firstName} {student.lastName}</h1>
            <div className="flex flex-wrap items-center gap-3 mt-2 text-sm text-muted-foreground">
              <span className="flex items-center gap-1"><GraduationCap className="w-4 h-4" />{classe?.name ?? "—"}</span>
              <span className="flex items-center gap-1"><User className="w-4 h-4" />{student.gender === "M" ? "Garçon" : "Fille"}</span>
              {student.birthDate && <span className="flex items-center gap-1"><Calendar className="w-4 h-4" />{age} ans</span>}
              {level && <Badge variant="secondary">{level.code}</Badge>}
              {pendingAlerts > 0 && <Badge className="bg-destructive/10 text-destructive border-destructive/20">{pendingAlerts} alerte(s)</Badge>}
            </div>
            <p className="mt-2 text-xs text-muted-foreground italic flex items-center gap-1">
              <Eye className="w-3.5 h-3.5" /> Vous voyez uniquement vos évaluations pour cet élève.
            </p>
          </div>
        </div>

        {/* Active alerts */}
        {alerts.filter((a) => !a.resolved).map((a) => (
          <Card key={a.id} className={`border-l-4 ${a.level === "critical" ? "border-l-destructive" : "border-l-amber-400"}`}>
            <CardContent className="p-4 flex items-start gap-3">
              <Bell className={`w-5 h-5 mt-0.5 shrink-0 ${a.level === "critical" ? "text-destructive" : "text-amber-500"}`} />
              <div>
                <p className="font-medium text-foreground">{a.level === "critical" ? "Alerte importante" : "Alerte légère"}</p>
                <p className="text-sm text-muted-foreground">{a.cause}</p>
              </div>
            </CardContent>
          </Card>
        ))}

        {/* Stats */}
        <div className="grid lg:grid-cols-3 gap-4 md:gap-6">
          <div className="lg:col-span-2">
            <RadarPanel stats={myStats} title="Mes évaluations — radar des compétences" />
          </div>
          <SummaryPanel stats={myStats} />
        </div>
        <SkillGrid stats={myStats} />
      </div>
    );
  }

  // ═════════════════════════════════════════════════════════
  // ADMIN / DIRECTEUR VIEW — full edit + global analytics
  // ═════════════════════════════════════════════════════════
  return (
    <div className="space-y-6 animate-in fade-in duration-500">

      {/* Header with edit controls */}
      <div className="flex flex-col sm:flex-row gap-4">
        <div className="w-16 h-16 sm:w-20 sm:h-20 rounded-2xl bg-primary/10 flex items-center justify-center text-primary font-bold text-2xl shrink-0">
          {student.firstName[0]}{student.lastName[0]}
        </div>
        <div className="flex-1 min-w-0">
          {editing ? (
            <div className="space-y-3">
              <div className="grid grid-cols-2 gap-2">
                <div className="space-y-1">
                  <Label className="text-xs">Prénom</Label>
                  <Input value={editFirstName} onChange={(e) => setEditFirstName(e.target.value)} className="h-8" />
                </div>
                <div className="space-y-1">
                  <Label className="text-xs">Nom</Label>
                  <Input value={editLastName} onChange={(e) => setEditLastName(e.target.value)} className="h-8" />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div className="space-y-1">
                  <Label className="text-xs">Date de naissance</Label>
                  <Input type="date" value={editBirthDate} onChange={(e) => setEditBirthDate(e.target.value)} className="h-8" />
                </div>
                <div className="space-y-1">
                  <Label className="text-xs">Genre</Label>
                  <Select value={editGender} onValueChange={(v) => setEditGender(v as "M" | "F")}>
                    <SelectTrigger className="h-8"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="M">Garçon</SelectItem>
                      <SelectItem value="F">Fille</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Classe</Label>
                <Select value={editClassId} onValueChange={setEditClassId}>
                  <SelectTrigger className="h-8"><SelectValue placeholder="Choisir une classe" /></SelectTrigger>
                  <SelectContent>
                    {classes.map((c) => (
                      <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              {saveError && <p className="text-xs text-destructive">{saveError}</p>}
              <div className="flex gap-2">
                <Button size="sm" onClick={saveEdit} disabled={saving} className="gap-1.5">
                  {saving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Save className="w-3.5 h-3.5" />}
                  Enregistrer
                </Button>
                <Button size="sm" variant="outline" onClick={cancelEdit} disabled={saving} className="gap-1.5">
                  <X className="w-3.5 h-3.5" /> Annuler
                </Button>
              </div>
            </div>
          ) : (
            <>
              <div className="flex items-start justify-between gap-3">
                <div>
                  <h1 className="text-2xl font-bold tracking-tight">{student.firstName} {student.lastName}</h1>
                  <div className="flex flex-wrap items-center gap-3 mt-2 text-sm text-muted-foreground">
                    <span className="flex items-center gap-1"><GraduationCap className="w-4 h-4" />{classe?.name ?? "—"}</span>
                    <span className="flex items-center gap-1"><User className="w-4 h-4" />{student.gender === "M" ? "Garçon" : "Fille"}</span>
                    {student.birthDate && <span className="flex items-center gap-1"><Calendar className="w-4 h-4" />{age} ans</span>}
                    {level && <Badge variant="secondary">{level.code}</Badge>}
                    {pendingAlerts > 0 && <Badge className="bg-destructive/10 text-destructive border-destructive/20">{pendingAlerts} alerte(s)</Badge>}
                  </div>
                </div>
                <Button size="sm" variant="outline" onClick={startEdit} className="gap-1.5 shrink-0">
                  <Edit className="w-3.5 h-3.5" /> Modifier
                </Button>
              </div>
            </>
          )}
        </div>
      </div>

      {/* Active alerts */}
      {alerts.filter((a) => !a.resolved).map((a) => (
        <Card key={a.id} className={`border-l-4 ${a.level === "critical" ? "border-l-destructive" : "border-l-amber-400"}`}>
          <CardContent className="p-4 flex items-start gap-3">
            <Bell className={`w-5 h-5 mt-0.5 shrink-0 ${a.level === "critical" ? "text-destructive" : "text-amber-500"}`} />
            <div>
              <p className="font-medium text-foreground">{a.level === "critical" ? "Alerte importante" : "Alerte légère"}</p>
              <p className="text-sm text-muted-foreground">{a.cause}</p>
            </div>
          </CardContent>
        </Card>
      ))}

      {/* Analytics toggle */}
      <div className="flex items-center gap-2">
        <Button
          size="sm"
          variant={!showGlobal ? "default" : "outline"}
          onClick={() => setShowGlobal(false)}
          className="gap-1.5"
        >
          <Eye className="w-3.5 h-3.5" /> Vue globale
        </Button>
        <Button
          size="sm"
          variant={showGlobal ? "default" : "outline"}
          onClick={() => setShowGlobal(true)}
          className="gap-1.5"
        >
          <BarChart2 className="w-3.5 h-3.5" /> Analyse globale (tous les enseignants)
        </Button>
      </div>

      {showGlobal && (
        <Card className="border-primary/20 bg-primary/5">
          <CardContent className="p-3 text-xs text-primary flex items-center gap-2">
            <BarChart2 className="w-3.5 h-3.5 shrink-0" />
            Vous visualisez les évaluations combinées de <strong>tous les enseignants</strong>. Cela donne une vue d'ensemble des forces et faiblesses de l'élève sur toutes les matières.
          </CardContent>
        </Card>
      )}

      {/* Charts */}
      <div className="grid lg:grid-cols-3 gap-4 md:gap-6">
        <div className="lg:col-span-2">
          <RadarPanel
            stats={displayStats}
            title={showGlobal ? "Analyse globale — tous enseignants" : "Vue globale des compétences"}
          />
        </div>
        <SummaryPanel stats={displayStats} />
      </div>

      <SkillGrid stats={displayStats} />
    </div>
  );
}
