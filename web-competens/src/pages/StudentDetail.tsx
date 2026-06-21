import { useMemo } from "react";
import { useParams } from "react-router-dom";
import { useAppStore } from "@/stores/app-store";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Calendar, User, GraduationCap, TrendingUp, Bell, CheckCircle, Clock, XCircle } from "lucide-react";
import { ResponsiveContainer, RadarChart, PolarGrid, PolarAngleAxis, PolarRadiusAxis, Radar, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend } from "recharts";

export default function StudentDetailPage() {
  const { id } = useParams<{ id: string }>();
  const students = useAppStore((s) => s.students);
  const classes = useAppStore((s) => s.classes);
  const levels = useAppStore((s) => s.levels);
  const competencies = useAppStore((s) => s.competencies);
  const evaluations = useAppStore((s) => s.evaluations);
  const alerts = useAppStore((s) => s.alerts.filter((a) => a.studentId === id));
  const getStudentStats = useAppStore((s) => s.getStudentStats);

  const student = useMemo(() => students.find((s) => s.id === id), [students, id]);
  const stats = useMemo(() => (id ? getStudentStats(id) : []), [id, getStudentStats]);

  if (!student) return null;

  const cls = classes.find((c) => c.id === student.classId);
  const level = cls ? levels.find((l) => l.id === cls.levelId) : undefined;
  const age = new Date().getFullYear() - new Date(student.birthDate).getFullYear();

  const studentEvals = evaluations.filter((e) => e.studentId === student.id);
  const latestEvalMap = new Map<string, string>();
  for (const comp of competencies) {
    const ce = studentEvals.filter((e) => e.competencyId === comp.id);
    if (ce.length > 0) {
      latestEvalMap.set(comp.code, ce[ce.length - 1].status);
    }
  }

  const radarData = competencies.map((c) => ({
    subject: c.code,
    value: stats.find((s) => s.competencyId === c.id)?.acquisitionRate ?? 0,
    fullMark: 100,
  }));

  const statusIcon = (status: string) => {
    switch (status) {
      case "acquis": return <CheckCircle className="w-4 h-4 text-green-500" />;
      case "en_cours": return <Clock className="w-4 h-4 text-amber-500" />;
      default: return <XCircle className="w-4 h-4 text-red-500" />;
    }
  };

  const statusLabel = (status: string) => {
    switch (status) {
      case "acquis": return "Acquis";
      case "en_cours": return "En cours";
      default: return "Non acquis";
    }
  };

  const pendingAlerts = alerts.filter((a) => !a.resolved).length;

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
            <span className="flex items-center gap-1"><GraduationCap className="w-4 h-4" /> {cls?.name ?? "—"}</span>
            <span className="flex items-center gap-1"><User className="w-4 h-4" /> {student.gender === "M" ? "Garçon" : "Fille"}</span>
            <span className="flex items-center gap-1"><Calendar className="w-4 h-4" /> {age} ans</span>
            {level && <Badge variant="secondary">{level.code}</Badge>}
            {pendingAlerts > 0 && <Badge className="bg-destructive/10 text-destructive border-destructive/20">{pendingAlerts} alerte(s)</Badge>}
          </div>
        </div>
      </div>

      {/* Alerts */}
      {alerts.length > 0 && (
        <div className="space-y-2">
          {alerts.filter((a) => !a.resolved).map((a) => (
            <Card key={a.id} className={`border-l-4 ${a.level === "critical" ? "border-l-destructive" : "border-l-warning"}`}>
              <CardContent className="p-4 flex items-start gap-3">
                <Bell className={`w-5 h-5 mt-0.5 shrink-0 ${a.level === "critical" ? "text-destructive" : "text-warning"}`} />
                <div>
                  <p className="font-medium text-foreground">{a.level === "critical" ? "Alerte importante" : "Alerte légère"}</p>
                  <p className="text-sm text-muted-foreground">{a.cause}</p>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      <div className="grid lg:grid-cols-3 gap-4 md:gap-6">
        {/* Radar Chart */}
        <Card className="lg:col-span-2 border-border/50">
          <CardHeader className="pb-2">
            <CardTitle className="text-base font-semibold flex items-center gap-2">
              <TrendingUp className="w-4 h-4 text-primary" /> Radar des compétences
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="h-[300px] md:h-[360px]">
              <ResponsiveContainer width="100%" height="100%">
                <RadarChart data={radarData} cx="50%" cy="50%" outerRadius="75%">
                  <PolarGrid stroke="hsl(var(--border))" />
                  <PolarAngleAxis dataKey="subject" tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }} />
                  <PolarRadiusAxis angle={30} domain={[0, 100]} tick={{ fontSize: 10 }} />
                  <Radar name="Taux d'acquisition" dataKey="value" stroke="hsl(220 99% 62%)" fill="hsl(220 99% 62%)" fillOpacity={0.2} />
                </RadarChart>
              </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>

        {/* Competency Summary */}
        <Card className="border-border/50">
          <CardHeader className="pb-2">
            <CardTitle className="text-base font-semibold">Résumé</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {stats.map((s) => (
              <div key={s.competencyCode} className="space-y-1.5">
                <div className="flex items-center justify-between text-xs">
                  <span className="font-medium text-foreground">{s.competencyCode}</span>
                  <div className="flex items-center gap-1.5">
                    {statusIcon(s.lastStatus)}
                    <span className="text-muted-foreground">{s.acquisitionRate}%</span>
                  </div>
                </div>
                <Progress value={s.acquisitionRate} className="h-1.5" />
              </div>
            ))}
          </CardContent>
        </Card>
      </div>

      {/* Competency Details */}
      <Card className="border-border/50">
        <CardHeader className="pb-2">
          <CardTitle className="text-base font-semibold">Détail par compétence</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {stats.map((s) => (
              <div key={s.competencyCode} className="flex items-start gap-3 p-3 rounded-xl bg-muted/40">
                <div className="w-10 h-10 rounded-lg flex items-center justify-center shrink-0"
                  style={{
                    backgroundColor: s.acquisitionRate >= 70 ? "hsl(122 39% 49% / 0.15)" : s.acquisitionRate >= 40 ? "hsl(25 100% 62% / 0.15)" : "hsl(4 77% 55% / 0.15)",
                  }}
                >
                  {statusIcon(s.lastStatus)}
                </div>
                <div className="min-w-0">
                  <p className="text-sm font-semibold text-foreground">{s.competencyCode}</p>
                  <p className="text-xs text-muted-foreground truncate">{s.competencyTitle}</p>
                  <div className="flex items-center gap-2 mt-1.5">
                    <Progress value={s.acquisitionRate} className="h-1 flex-1" />
                    <span className="text-xs font-mono font-medium">{s.acquisitionRate}%</span>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
