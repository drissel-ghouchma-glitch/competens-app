import { useMemo } from "react";
import { Link } from "react-router-dom";
import { useAlerts } from "@/hooks/use-alerts";
import { useStudents } from "@/hooks/use-students";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Bell, CheckCheck, ArrowRight, Loader2, AlertCircle } from "lucide-react";
import { cn } from "@/lib/utils";

export default function AlertsPage() {
  const { alerts, notifications, loading, error, markAlertResolved, markNotificationRead } = useAlerts();
  const { students } = useStudents();

  const sortedAlerts = useMemo(() =>
    [...alerts].sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()),
    [alerts]
  );

  const unreadNotifications = useMemo(() => notifications.filter((n) => !n.read), [notifications]);
  const activeAlerts   = useMemo(() => sortedAlerts.filter((a) => !a.resolved),  [sortedAlerts]);
  const resolvedAlerts = useMemo(() => sortedAlerts.filter((a) => a.resolved),   [sortedAlerts]);

  const criticalCount = activeAlerts.filter((a) => a.level === "critical").length;
  const warningCount  = activeAlerts.filter((a) => a.level === "warning").length;

  if (loading) {
    return (
      <div className="flex items-center justify-center py-24">
        <Loader2 className="w-8 h-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="space-y-6 animate-in fade-in duration-500">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Alertes</h1>
          <p className="text-sm text-muted-foreground">
            {criticalCount} critiques, {warningCount} légères
          </p>
        </div>
      </div>

      {error && (
        <div className="flex items-center gap-2 p-3 rounded-lg bg-destructive/10 text-destructive text-sm">
          <AlertCircle className="w-4 h-4 shrink-0" /> {error}
        </div>
      )}

      {/* Summary */}
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
        <Card className="border-destructive/30 bg-destructive/5">
          <CardContent className="p-4 flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-destructive/10 flex items-center justify-center">
              <Bell className="w-5 h-5 text-destructive" />
            </div>
            <div>
              <p className="text-2xl font-bold font-mono text-destructive">{criticalCount}</p>
              <p className="text-xs text-muted-foreground">Critiques</p>
            </div>
          </CardContent>
        </Card>
        <Card className="border-warning/30 bg-warning/5">
          <CardContent className="p-4 flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-warning/10 flex items-center justify-center">
              <Bell className="w-5 h-5 text-warning" />
            </div>
            <div>
              <p className="text-2xl font-bold font-mono text-warning">{warningCount}</p>
              <p className="text-xs text-muted-foreground">Légères</p>
            </div>
          </CardContent>
        </Card>
        <Card className="col-span-2 sm:col-span-1 border-border/50">
          <CardContent className="p-4 flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center">
              <CheckCheck className="w-5 h-5 text-primary" />
            </div>
            <div>
              <p className="text-2xl font-bold font-mono text-foreground">{resolvedAlerts.length}</p>
              <p className="text-xs text-muted-foreground">Résolues</p>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Notifications */}
      {unreadNotifications.length > 0 && (
        <Card className="border-border/50">
          <CardHeader className="pb-2">
            <CardTitle className="text-base font-semibold flex items-center gap-2">
              <Bell className="w-4 h-4 text-primary" /> Notifications ({unreadNotifications.length})
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {unreadNotifications.map((n) => (
              <div key={n.id} className="flex items-start justify-between gap-3 p-3 rounded-xl bg-muted/40">
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium">{n.title}</p>
                  <p className="text-xs text-muted-foreground">{n.message}</p>
                </div>
                <Button variant="ghost" size="sm" onClick={() => markNotificationRead(n.id)}>
                  Lu
                </Button>
              </div>
            ))}
          </CardContent>
        </Card>
      )}

      {/* Active Alerts */}
      <div>
        <h2 className="text-base font-semibold mb-3">Alertes actives</h2>
        <div className="grid gap-3">
          {activeAlerts.length === 0 ? (
            <Card className="border-dashed border-2">
              <CardContent className="p-6 text-center">
                <CheckCheck className="w-10 h-10 text-green-500 mx-auto mb-2" />
                <p className="text-muted-foreground font-medium">Aucune alerte active</p>
                <p className="text-sm text-muted-foreground">Tout va bien !</p>
              </CardContent>
            </Card>
          ) : (
            activeAlerts.map((a) => {
              const student = students.find((s) => s.id === a.studentId);
              return (
                <Card
                  key={a.id}
                  className={cn(
                    "border-l-4",
                    a.level === "critical" ? "border-l-destructive" : "border-l-warning"
                  )}
                >
                  <CardContent className="p-4 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
                    <div className="flex items-start gap-3">
                      <Bell className={cn("w-5 h-5 mt-0.5 shrink-0", a.level === "critical" ? "text-destructive" : "text-warning")} />
                      <div>
                        <div className="flex items-center gap-2 flex-wrap">
                          <Badge variant={a.level === "critical" ? "destructive" : "secondary"}>
                            {a.level === "critical" ? "Critique" : "Légère"}
                          </Badge>
                          <span className="text-xs text-muted-foreground">
                            {new Date(a.date).toLocaleDateString("fr-FR")}
                          </span>
                        </div>
                        <p className="font-semibold mt-1">
                          {student ? `${student.firstName} ${student.lastName}` : "Élève inconnu"}
                        </p>
                        <p className="text-sm text-muted-foreground">{a.cause}</p>
                      </div>
                    </div>
                    <div className="flex items-center gap-2 self-end sm:self-auto">
                      {student && (
                        <Link to={`/students/${a.studentId}`}>
                          <Button variant="outline" size="sm" className="gap-1">
                            Profil <ArrowRight className="w-3 h-3" />
                          </Button>
                        </Link>
                      )}
                      <Button variant="outline" size="sm" onClick={() => markAlertResolved(a.id)}>
                        <CheckCheck className="w-3.5 h-3.5 mr-1" /> Résoudre
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              );
            })
          )}
        </div>
      </div>

      {/* Resolved History */}
      {resolvedAlerts.length > 0 && (
        <div>
          <h2 className="text-base font-semibold mb-3 text-muted-foreground">Historique résolu</h2>
          <div className="space-y-2">
            {resolvedAlerts.slice(0, 10).map((a) => {
              const student = students.find((s) => s.id === a.studentId);
              return (
                <div key={a.id} className="flex items-center gap-3 p-3 rounded-xl bg-muted/30 text-sm">
                  <CheckCheck className="w-4 h-4 text-muted-foreground shrink-0" />
                  <span className="font-medium">
                    {student?.firstName} {student?.lastName}
                  </span>
                  <span className="text-muted-foreground">— {a.cause.slice(0, 60)}</span>
                  <span className="text-xs text-muted-foreground ml-auto shrink-0">
                    {a.resolvedAt ? new Date(a.resolvedAt).toLocaleDateString("fr-FR") : ""}
                  </span>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
