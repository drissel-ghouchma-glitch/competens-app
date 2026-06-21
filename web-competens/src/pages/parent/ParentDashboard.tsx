import { useState } from "react";
import { useParent, type ParentChild, type ParentChildStat } from "@/hooks/use-parent";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  GraduationCap, User, Calendar, Bell, TrendingUp,
  CheckCircle, Clock, XCircle, Loader2, Users,
} from "lucide-react";
import {
  ResponsiveContainer, RadarChart, PolarGrid, PolarAngleAxis,
  PolarRadiusAxis, Radar,
} from "recharts";

// ── Helpers ────────────────────────────────────────────────────

function StatusIcon({ status }: { status: string }) {
  switch (status) {
    case "acquis":    return <CheckCircle className="w-4 h-4 text-green-500" />;
    case "en_cours":  return <Clock       className="w-4 h-4 text-amber-500" />;
    default:          return <XCircle     className="w-4 h-4 text-red-500"   />;
  }
}

function statusLabel(s: string) {
  switch (s) {
    case "acquis":    return "Acquis";
    case "en_cours":  return "En cours";
    default:          return "Non acquis";
  }
}

function acqColor(rate: number) {
  if (rate >= 70) return "hsl(122 39% 49% / 0.15)";
  if (rate >= 40) return "hsl(25 100% 62% / 0.15)";
  return "hsl(4 77% 55% / 0.15)";
}

// ── Child Analytics (read-only) ────────────────────────────────

function ChildAnalytics({ child }: { child: ParentChild }) {
  const radarData = child.stats.map((s) => ({
    subject: s.competencyCode, value: s.acquisitionRate, fullMark: 100,
  }));

  const acquired  = child.stats.filter((s) => s.lastStatus === "acquis").length;
  const inProgress = child.stats.filter((s) => s.lastStatus === "en_cours").length;
  const notAcq    = child.stats.filter((s) => s.lastStatus === "non_acquis").length;
  const globalRate = child.stats.length > 0
    ? Math.round(child.stats.reduce((sum, s) => sum + s.acquisitionRate, 0) / child.stats.length)
    : 0;

  return (
    <div className="space-y-6">
      {/* Alerts */}
      {child.alerts.length > 0 && (
        <div className="space-y-2">
          {child.alerts.map((a) => (
            <Card key={a.id} className={`border-l-4 ${a.level === "critical" ? "border-l-destructive" : "border-l-amber-400"}`}>
              <CardContent className="p-4 flex items-start gap-3">
                <Bell className={`w-5 h-5 mt-0.5 shrink-0 ${a.level === "critical" ? "text-destructive" : "text-amber-500"}`} />
                <div>
                  <p className="font-medium text-foreground text-sm">{a.level === "critical" ? "Alerte importante" : "Alerte"}</p>
                  <p className="text-xs text-muted-foreground">{a.cause}</p>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* Summary cards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {[
          { label: "Taux global",   value: `${globalRate}%`,  color: "text-primary",        bg: "bg-primary/10" },
          { label: "Acquis",        value: acquired,           color: "text-green-600",       bg: "bg-green-500/10" },
          { label: "En cours",      value: inProgress,         color: "text-amber-600",       bg: "bg-amber-500/10" },
          { label: "Non acquis",    value: notAcq,             color: "text-red-600",         bg: "bg-red-500/10" },
        ].map((c) => (
          <Card key={c.label} className="border-border/50">
            <CardContent className="p-4 text-center">
              <div className={`w-10 h-10 rounded-xl ${c.bg} flex items-center justify-center mx-auto mb-2`}>
                <TrendingUp className={`w-5 h-5 ${c.color}`} />
              </div>
              <p className={`text-xl font-bold ${c.color}`}>{c.value}</p>
              <p className="text-xs text-muted-foreground mt-0.5">{c.label}</p>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Radar + summary */}
      {child.stats.length > 0 ? (
        <div className="grid lg:grid-cols-3 gap-4">
          <Card className="lg:col-span-2 border-border/50">
            <CardHeader className="pb-2">
              <CardTitle className="text-base font-semibold flex items-center gap-2">
                <TrendingUp className="w-4 h-4 text-primary" /> Radar des compétences
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="h-[280px] md:h-[320px]">
                <ResponsiveContainer width="100%" height="100%">
                  <RadarChart data={radarData} cx="50%" cy="50%" outerRadius="72%">
                    <PolarGrid stroke="hsl(var(--border))" />
                    <PolarAngleAxis dataKey="subject" tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }} />
                    <PolarRadiusAxis angle={30} domain={[0, 100]} tick={{ fontSize: 10 }} />
                    <Radar name="Acquisition" dataKey="value" stroke="hsl(220 99% 62%)" fill="hsl(220 99% 62%)" fillOpacity={0.2} />
                  </RadarChart>
                </ResponsiveContainer>
              </div>
            </CardContent>
          </Card>

          <Card className="border-border/50">
            <CardHeader className="pb-2">
              <CardTitle className="text-base font-semibold">Résumé</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              {child.stats.map((s) => (
                <div key={s.competencyCode} className="space-y-1">
                  <div className="flex items-center justify-between text-xs">
                    <span className="font-medium">{s.competencyCode}</span>
                    <div className="flex items-center gap-1"><StatusIcon status={s.lastStatus} /><span className="text-muted-foreground">{s.acquisitionRate}%</span></div>
                  </div>
                  <Progress value={s.acquisitionRate} className="h-1.5" />
                </div>
              ))}
            </CardContent>
          </Card>
        </div>
      ) : (
        <Card className="border-dashed border-2">
          <CardContent className="p-10 text-center text-muted-foreground text-sm">
            Aucune évaluation enregistrée pour le moment.
          </CardContent>
        </Card>
      )}

      {/* Skill grid */}
      {child.stats.length > 0 && (
        <Card className="border-border/50">
          <CardHeader className="pb-2">
            <CardTitle className="text-base font-semibold">Détail par compétence</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3">
              {child.stats.map((s) => (
                <div key={s.competencyCode} className="flex items-start gap-3 p-3 rounded-xl bg-muted/40">
                  <div className="w-10 h-10 rounded-lg flex items-center justify-center shrink-0"
                    style={{ backgroundColor: acqColor(s.acquisitionRate) }}>
                    <StatusIcon status={s.lastStatus} />
                  </div>
                  <div className="min-w-0">
                    <p className="text-sm font-semibold">{s.competencyCode}</p>
                    <p className="text-xs text-muted-foreground truncate">{s.competencyTitle}</p>
                    <div className="flex items-center gap-2 mt-1.5">
                      <Progress value={s.acquisitionRate} className="h-1 flex-1" />
                      <span className="text-xs font-mono">{s.acquisitionRate}%</span>
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
      )}
    </div>
  );
}

// ── Main Page ──────────────────────────────────────────────────

export default function ParentDashboard() {
  const { children, loading, error } = useParent();
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const selected = selectedId
    ? children.find((c) => c.id === selectedId) ?? children[0]
    : children[0];

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="rounded-lg border border-destructive/30 bg-destructive/5 p-4 text-sm text-destructive">{error}</div>
    );
  }

  if (children.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center h-64 gap-3 text-muted-foreground">
        <Users className="w-12 h-12" />
        <p className="font-medium">Aucun enfant associé à votre compte.</p>
        <p className="text-sm text-center max-w-xs">
          Contactez l'administrateur pour que vos enfants soient liés à votre profil.
        </p>
      </div>
    );
  }

  const age = selected
    ? Math.floor((Date.now() - new Date(selected.birthDate).getTime()) / (365.25 * 24 * 60 * 60 * 1000))
    : 0;

  return (
    <div className="space-y-6 animate-in fade-in duration-500">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Suivi de mes enfants</h1>
          <p className="text-sm text-muted-foreground">Vue lecture seule — données combinées de tous les enseignants</p>
        </div>

        {/* Child selector — only if more than one child */}
        {children.length > 1 && (
          <Select value={selected?.id ?? ""} onValueChange={setSelectedId}>
            <SelectTrigger className="w-56">
              <SelectValue placeholder="Choisir un enfant" />
            </SelectTrigger>
            <SelectContent>
              {children.map((c) => (
                <SelectItem key={c.id} value={c.id}>
                  {c.firstName} {c.lastName}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}
      </div>

      {/* Child tabs (visual) — when multiple children */}
      {children.length > 1 && (
        <div className="flex gap-2 flex-wrap">
          {children.map((c) => (
            <button
              key={c.id}
              onClick={() => setSelectedId(c.id)}
              className={`flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-medium transition-all border ${
                selected?.id === c.id
                  ? "bg-primary text-primary-foreground border-primary shadow-sm"
                  : "bg-card border-border text-muted-foreground hover:text-foreground hover:border-primary/40"
              }`}
            >
              <span className="w-7 h-7 rounded-full bg-current/10 flex items-center justify-center text-xs font-bold shrink-0">
                {c.firstName[0]}{c.lastName[0]}
              </span>
              {c.firstName}
              {c.alerts.length > 0 && (
                <Badge className="bg-destructive/10 text-destructive border-destructive/20 text-[10px] px-1.5 py-0">
                  {c.alerts.length}
                </Badge>
              )}
            </button>
          ))}
        </div>
      )}

      {/* Selected child header */}
      {selected && (
        <>
          <div className="flex items-center gap-4">
            <div className="w-14 h-14 rounded-2xl bg-primary/10 flex items-center justify-center text-primary font-bold text-xl shrink-0">
              {selected.firstName[0]}{selected.lastName[0]}
            </div>
            <div>
              <h2 className="text-xl font-bold">{selected.firstName} {selected.lastName}</h2>
              <div className="flex flex-wrap items-center gap-3 mt-1 text-sm text-muted-foreground">
                <span className="flex items-center gap-1"><User className="w-3.5 h-3.5" />{selected.gender === "M" ? "Garçon" : "Fille"}</span>
                {selected.birthDate && <span className="flex items-center gap-1"><Calendar className="w-3.5 h-3.5" />{age} ans</span>}
                {selected.alerts.length > 0 && (
                  <Badge className="bg-destructive/10 text-destructive border-destructive/20">
                    {selected.alerts.length} alerte(s) active(s)
                  </Badge>
                )}
              </div>
            </div>
          </div>

          <ChildAnalytics child={selected} />
        </>
      )}
    </div>
  );
}
