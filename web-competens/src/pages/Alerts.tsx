import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { useAlerts } from "@/hooks/use-alerts";
import { useActivityFeed } from "@/hooks/use-activity-feed";
import { useAttendance } from "@/hooks/use-attendance";
import { useAuth } from "@/hooks/use-auth";
import { useClasses } from "@/hooks/use-classes";
import { useStudents } from "@/hooks/use-students";
import { useI18n } from "@/i18n";
import type { ActivityEvent, ActivityEventType, Notification } from "@/types";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  AlertCircle, ArrowRight, Bell, Building2, CalendarDays, CheckCheck,
  ClipboardCheck, GraduationCap, Loader2, RefreshCw, Search, UserRound, Users,
} from "lucide-react";
import { cn } from "@/lib/utils";

const activityTypes: ActivityEventType[] = [
  "attendance_registered",
  "attendance_confirmed",
  "evaluation_recorded",
  "recovery_recorded",
  "recovery_admin_review_requested",
  "admin_request_submitted",
  "admin_request_reviewed",
  "risk_alert_opened",
];

function todayLocal(): string {
  const now = new Date();
  const offset = now.getTimezoneOffset() * 60_000;
  return new Date(now.getTime() - offset).toISOString().slice(0, 10);
}

function numericPayload(payload: Record<string, unknown> | undefined, key: string): number {
  const value = payload?.[key];
  return typeof value === "number" ? value : Number(value ?? 0);
}

function eventIcon(eventType: ActivityEventType) {
  if (eventType.includes("attendance")) return CalendarDays;
  if (eventType.includes("evaluation")) return ClipboardCheck;
  if (eventType.includes("recovery")) return GraduationCap;
  if (eventType.includes("request")) return UserRound;
  return Bell;
}

export default function AlertsPage() {
  const { user } = useAuth();
  const { alerts, notifications, loading, error, refetch, markAlertResolved, markNotificationRead } = useAlerts();
  const { students } = useStudents();
  const { classes, teachers } = useClasses();
  const { classes: attendanceClasses } = useAttendance();
  const { t, lang } = useI18n();
  const [date, setDate] = useState(todayLocal);
  const [classId, setClassId] = useState("all");
  const [actorId, setActorId] = useState("all");
  const [eventType, setEventType] = useState<ActivityEventType | "all">("all");
  const [studentQuery, setStudentQuery] = useState("");
  const isActivityViewer = user?.role === "admin" || user?.role === "directeur" || user?.role === "professeur";
  const isTeacher = user?.role === "professeur";
  const selectableClasses = isTeacher ? attendanceClasses : classes;
  const canResolveAlerts = isActivityViewer;
  const locale = lang === "ar" ? "ar-MA" : "fr-FR";
  const allMyClassesLabel = lang === "ar" ? "كل أقسامي" : "Toutes mes classes";
  const managementMessagesTitle = lang === "ar" ? "إشعارات الإدارة وطلباتي" : "Messages de l’administration et mes demandes";
  const managementMessagesHint = lang === "ar" ? "تأكيد الغياب، حالة الطلبات، وأي متابعة تخص أقسامك." : "Confirmation des présences, état de vos demandes et suivis concernant vos classes.";
  const alertCardDescriptions = lang === "ar"
    ? {
        critical: "حالات تحتاج متابعة سريعة، عادة عندما تنخفض مهارة تلميذ إلى 50% أو أقل.",
        warning: "إنذار مبكر لمتابعة تراجع مهارة قبل أن تصبح الحالة حرجة.",
        resolved: "تنبيهات تمت معالجتها أو إغلاقها، وتبقى في السجل للرجوع إليها.",
      }
    : {
        critical: "À suivre rapidement, en général lorsqu’une compétence atteint 50 % ou moins.",
        warning: "Avertissement précoce à suivre avant que la situation ne devienne critique.",
        resolved: "Alertes traitées ou clôturées, conservées dans l’historique.",
      };
  const copy = lang === "ar"
    ? {
        activityTitle: "سجل النشاط", activitySubtitle: "كل العمليات المؤكدة في النظام حسب اليوم.",
        date: "التاريخ", allClasses: "كل الأقسام", allTeachers: "كل الأساتذة", allActivities: "كل العمليات",
        student: "البحث عن تلميذ", refresh: "تحديث", noActivity: "لا توجد عملية مطابقة لهذا اليوم.",
        activityCount: "عملية", evaluatedStudents: "تقييمات", attendance: "سجلات الغياب", migration: "يلزم تشغيل تحديث قاعدة البيانات 014 لإظهار سجل النشاط.",
        notificationHistory: "سجل الإشعارات", noNotifications: "لا توجد إشعارات حتى الآن.",
        teacher: "الأستاذ", class: "القسم", pupil: "التلميذ", pending: "قيد الانتظار", approved: "مقبول", rejected: "مرفوض",
        attendanceRegistered: "تم تسجيل الحضور", attendanceConfirmed: "تم تأكيد الحضور", evaluationRecorded: "تم تسجيل تقييم",
        recoveryRecorded: "تم تسجيل جلسة استرجاع", recoveryReview: "طلب مراجعة استرجاع", requestSubmitted: "تم إرسال طلب", requestReviewed: "تمت معالجة طلب", riskAlert: "تنبيه متابعة",
        registeredFor: "سجّل الحضور لـ", confirmedFor: "أكد الحضور لـ", evaluated: "قيّم", students: "تلاميذ", absent: "غائب", on: "في", resetSkill: "جلسة استرجاع مهارة", requestStatus: "حالة الطلب", absenceConfirmed: "تم تأكيد غياب التلميذ",
        scoreAffected: "تم تسجيل تقييم يخص التلميذ", management: "الإدارة", read: "مقروء", markRead: "وضع كمقروء", markedAbsent: "سجّل غياب",
      }
    : {
        activityTitle: "Journal d’activité", activitySubtitle: "Toutes les opérations validées, par journée.",
        date: "Date", allClasses: "Toutes les classes", allTeachers: "Tous les professeurs", allActivities: "Toutes les activités",
        student: "Rechercher un élève", refresh: "Actualiser", noActivity: "Aucune opération ne correspond à cette journée.",
        activityCount: "opérations", evaluatedStudents: "évaluations", attendance: "registres de présence", migration: "Exécutez la migration 014 pour afficher le journal d’activité.",
        notificationHistory: "Historique des notifications", noNotifications: "Aucune notification pour le moment.",
        teacher: "Professeur", class: "Classe", pupil: "Élève", pending: "En attente", approved: "Approuvée", rejected: "Refusée",
        attendanceRegistered: "Présences enregistrées", attendanceConfirmed: "Présences confirmées", evaluationRecorded: "Évaluation enregistrée",
        recoveryRecorded: "Entretien de récupération enregistré", recoveryReview: "Demande de récupération à examiner", requestSubmitted: "Demande envoyée", requestReviewed: "Demande traitée", riskAlert: "Alerte de suivi",
        registeredFor: "a enregistré les présences de", confirmedFor: "a confirmé les présences de", evaluated: "a évalué", students: "élèves", absent: "absent(s)", on: "le", resetSkill: "entretien de récupération", requestStatus: "Statut de la demande", absenceConfirmed: "Absence confirmée pour l’élève",
        scoreAffected: "Une évaluation a été enregistrée pour l’élève", management: "Administration", read: "Lu", markRead: "Marquer lu", markedAbsent: "a signalé l’absence de",
      };

  const feed = useActivityFeed({
    date,
    classId: classId === "all" ? undefined : classId,
    actorId: isTeacher ? user?.id : actorId === "all" ? undefined : actorId,
    eventType,
    studentQuery,
  });

  const sortedAlerts = useMemo(() => [...alerts].sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()), [alerts]);
  const activeAlerts = useMemo(() => sortedAlerts.filter((alert) => !alert.resolved), [sortedAlerts]);
  const resolvedAlerts = useMemo(() => sortedAlerts.filter((alert) => alert.resolved), [sortedAlerts]);
  const unreadNotifications = useMemo(() => notifications.filter((notification) => !notification.read), [notifications]);
  const criticalCount = activeAlerts.filter((alert) => alert.level === "critical").length;
  const warningCount = activeAlerts.filter((alert) => alert.level === "warning").length;
  const evaluatedStudents = useMemo(
    () => feed.events.filter((event) => event.eventType === "evaluation_recorded" && event.payload.is_session === true).reduce((total, event) => total + numericPayload(event.payload, "student_count"), 0),
    [feed.events],
  );
  const attendanceRegisters = useMemo(
    () => feed.events.filter((event) => event.eventType === "attendance_registered").length,
    [feed.events],
  );

  const titleForEvent = (type: ActivityEventType) => ({
    attendance_registered: copy.attendanceRegistered,
    attendance_confirmed: copy.attendanceConfirmed,
    evaluation_recorded: copy.evaluationRecorded,
    recovery_recorded: copy.recoveryRecorded,
    recovery_admin_review_requested: copy.recoveryReview,
    admin_request_submitted: copy.requestSubmitted,
    admin_request_reviewed: copy.requestReviewed,
    risk_alert_opened: copy.riskAlert,
  })[type];

  const describeEvent = (event: ActivityEvent): string => {
    const count = numericPayload(event.payload, "student_count");
    const absent = numericPayload(event.payload, "absent_count");
    const actor = event.actorName || copy.management;
    const classe = event.className || "—";
    if (event.eventType === "attendance_registered") {
      if (event.studentName && event.payload.status === "absent") return `${actor} ${copy.markedAbsent} ${event.studentName}`;
      return `${actor} ${copy.registeredFor} ${classe} · ${count} ${copy.students}${absent ? ` · ${absent} ${copy.absent}` : ""}`;
    }
    if (event.eventType === "attendance_confirmed") return `${actor} ${copy.confirmedFor} ${classe}`;
    if (event.eventType === "evaluation_recorded") return event.studentName
      ? `${actor} ${copy.evaluated} ${event.studentName}${event.competencyCode ? ` · ${event.competencyCode}` : ""}`
      : `${actor} ${copy.evaluated} ${count} ${copy.students}${event.competencyCode ? ` · ${event.competencyCode}` : ""}`;
    if (event.eventType === "recovery_recorded") return `${actor} · ${copy.resetSkill}${event.studentName ? ` · ${event.studentName}` : ""}`;
    if (event.eventType === "recovery_admin_review_requested") return `${actor} · ${event.studentName ?? "—"}`;
    if (event.eventType === "admin_request_submitted") return `${actor} · ${String(event.payload.request_type ?? "")}`;
    if (event.eventType === "admin_request_reviewed") return `${actor} · ${copy.requestStatus}: ${String(event.payload.status ?? "")}`;
    return String(event.payload.cause ?? "");
  };

  const describeNotification = (notification: Notification) => {
    const student = students.find((candidate) => candidate.id === notification.studentId);
    const studentName = student ? `${student.firstName} ${student.lastName}` : "";
    const notificationClass = selectableClasses.find((candidate) => candidate.id === notification.classId);
    const className = notificationClass?.name;
    const eventTitle = notification.eventType ? titleForEvent(notification.eventType) : notification.title;
    let message = notification.message;
    if (notification.eventType === "attendance_confirmed") message = notification.studentId
      ? `${copy.absenceConfirmed}${studentName ? `: ${studentName}` : ""}.`
      : lang === "ar" ? `تم تأكيد الحضور للقسم ${className ?? ""}.` : `Les présences de ${className ?? "la classe"} ont été confirmées.`;
    if (notification.eventType === "evaluation_recorded" && notification.studentId) message = `${copy.scoreAffected}${studentName ? `: ${studentName}` : ""}.`;
    if (notification.eventType === "admin_request_submitted") message = lang === "ar" ? "تم حفظ طلبك وإرساله إلى الإدارة للمراجعة." : "Votre demande a été enregistrée et transmise à l’administration.";
    if (notification.eventType === "admin_request_reviewed") {
      const status = String(notification.payload?.status ?? "");
      const statusLabel = status === "approved" ? copy.approved : status === "rejected" ? copy.rejected : copy.pending;
      message = `${copy.requestStatus}: ${statusLabel}${notification.payload?.admin_note ? ` · ${String(notification.payload.admin_note)}` : ""}`;
    }
    if (notification.eventType === "risk_alert_opened") message = String(notification.payload?.cause ?? message);
    if (!message) message = notification.eventType ? titleForEvent(notification.eventType) : "";
    return { title: eventTitle, message };
  };

  const handleRefresh = async () => {
    await Promise.all([refetch(), feed.refetch()]);
  };

  return (
    <div className="space-y-6 animate-in fade-in duration-500">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">{t("alerts.title")}</h1>
          <p className="text-sm text-muted-foreground">{t("alerts.summary", { critical: criticalCount, warning: warningCount })}</p>
        </div>
        <Button variant="outline" className="gap-2 self-start" onClick={() => void handleRefresh()} disabled={loading || feed.loading}>
          <RefreshCw className={cn("w-4 h-4", (loading || feed.loading) && "animate-spin")} /> {copy.refresh}
        </Button>
      </div>

      {(error || feed.error) && (
        <div className="flex items-center gap-2 p-3 rounded-lg bg-destructive/10 text-destructive text-sm">
          <AlertCircle className="w-4 h-4 shrink-0" /> {error || feed.error}
        </div>
      )}

      {isTeacher && (
        <Card className="border-primary/25 bg-primary/[0.025]">
          <CardHeader className="pb-2"><CardTitle className="text-base font-semibold flex items-center gap-2"><Bell className="w-4 h-4 text-primary" /> {managementMessagesTitle} {unreadNotifications.length > 0 && <Badge variant="destructive">{unreadNotifications.length}</Badge>}</CardTitle><p className="text-sm text-muted-foreground">{managementMessagesHint}</p></CardHeader>
          <CardContent className="space-y-2 max-h-[340px] overflow-y-auto">
            {notifications.length === 0 ? <p className="text-sm text-muted-foreground text-center py-4">{copy.noNotifications}</p> : notifications.slice(0, 8).map((notification) => {
              const content = describeNotification(notification);
              return <div key={notification.id} className={cn("flex items-start justify-between gap-3 rounded-xl border p-3", notification.read ? "border-border/50 bg-muted/20 opacity-75" : "border-primary/20 bg-primary/[0.03]")}><div className="min-w-0"><div className="flex flex-wrap items-center gap-2"><p className="text-sm font-medium">{content.title}</p>{!notification.read && <Badge variant="secondary" className="text-[10px]">{copy.pending}</Badge>}</div><p className="text-xs text-muted-foreground mt-0.5">{content.message}</p><p className="text-[11px] text-muted-foreground mt-1">{new Date(notification.createdAt).toLocaleString(locale, { dateStyle: "medium", timeStyle: "short" })}</p></div>{!notification.read && <Button variant="ghost" size="sm" className="shrink-0" onClick={() => void markNotificationRead(notification.id)}>{copy.markRead}</Button>}</div>;
            })}
          </CardContent>
        </Card>
      )}

      {isActivityViewer && (
        <Card className="border-primary/20 overflow-hidden">
          <CardHeader className="pb-4 bg-primary/[0.03]">
            <CardTitle className="text-base font-semibold flex items-center gap-2">
              <ClipboardCheck className="w-4 h-4 text-primary" /> {copy.activityTitle}
            </CardTitle>
            <p className="text-sm text-muted-foreground">{copy.activitySubtitle}</p>
          </CardHeader>
          <CardContent className="p-4 md:p-5 space-y-4">
            <div className={cn("grid gap-3 sm:grid-cols-2", isTeacher ? "lg:grid-cols-4" : "lg:grid-cols-5")}>
              <label className="space-y-1.5"><span className="text-xs font-medium text-muted-foreground">{copy.date}</span><Input type="date" value={date} onChange={(event) => setDate(event.target.value)} /></label>
              <label className="space-y-1.5"><span className="text-xs font-medium text-muted-foreground">{copy.class}</span>
                <Select value={classId} onValueChange={setClassId}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="all">{isTeacher ? allMyClassesLabel : copy.allClasses}</SelectItem>{selectableClasses.map((classe) => <SelectItem key={classe.id} value={classe.id}>{classe.name}</SelectItem>)}</SelectContent></Select>
              </label>
              {!isTeacher && <label className="space-y-1.5"><span className="text-xs font-medium text-muted-foreground">{copy.teacher}</span>
                <Select value={actorId} onValueChange={setActorId}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="all">{copy.allTeachers}</SelectItem>{teachers.map((teacher) => <SelectItem key={teacher.id} value={teacher.id}>{`${teacher.firstName} ${teacher.lastName}`.trim()}</SelectItem>)}</SelectContent></Select>
              </label>}
              <label className="space-y-1.5"><span className="text-xs font-medium text-muted-foreground">{t("nav.alerts")}</span>
                <Select value={eventType} onValueChange={(value) => setEventType(value as ActivityEventType | "all")}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="all">{copy.allActivities}</SelectItem>{activityTypes.map((type) => <SelectItem key={type} value={type}>{titleForEvent(type)}</SelectItem>)}</SelectContent></Select>
              </label>
              <label className="space-y-1.5"><span className="text-xs font-medium text-muted-foreground">{copy.pupil}</span><div className="relative"><Search className="absolute start-3 top-3 w-4 h-4 text-muted-foreground" /><Input className="ps-9" value={studentQuery} onChange={(event) => setStudentQuery(event.target.value)} placeholder={copy.student} /></div></label>
            </div>

            {feed.migrationMissing ? (
              <div className="rounded-xl border border-warning/30 bg-warning/5 px-4 py-3 text-sm text-muted-foreground">{copy.migration}</div>
            ) : (
              <>
                <div className="grid grid-cols-3 gap-3">
                  <div className="rounded-xl bg-muted/50 p-3"><p className="text-xl font-bold font-mono">{feed.events.length}</p><p className="text-xs text-muted-foreground">{copy.activityCount}</p></div>
                  <div className="rounded-xl bg-primary/5 p-3"><p className="text-xl font-bold font-mono text-primary">{evaluatedStudents}</p><p className="text-xs text-muted-foreground">{copy.evaluatedStudents}</p></div>
                  <div className="rounded-xl bg-blue-500/5 p-3"><p className="text-xl font-bold font-mono text-blue-600">{attendanceRegisters}</p><p className="text-xs text-muted-foreground">{copy.attendance}</p></div>
                </div>
                <div className="space-y-2 max-h-[430px] overflow-y-auto pe-1">
                  {feed.loading ? <div className="flex justify-center py-8"><Loader2 className="w-6 h-6 animate-spin text-muted-foreground" /></div> : feed.events.length === 0 ? <p className="text-sm text-muted-foreground text-center py-7">{copy.noActivity}</p> : feed.events.map((event) => {
                    const Icon = eventIcon(event.eventType);
                    return <div key={event.id} className="flex gap-3 rounded-xl border border-border/70 p-3 bg-card">
                      <div className="w-9 h-9 rounded-lg bg-primary/10 text-primary flex items-center justify-center shrink-0"><Icon className="w-4 h-4" /></div>
                      <div className="min-w-0 flex-1"><div className="flex flex-wrap items-center gap-2"><p className="text-sm font-semibold">{titleForEvent(event.eventType)}</p><span className="text-xs text-muted-foreground">{new Date(event.createdAt).toLocaleTimeString(locale, { hour: "2-digit", minute: "2-digit" })}</span></div><p className="text-sm text-muted-foreground mt-0.5">{describeEvent(event)}</p><div className="flex flex-wrap gap-x-3 gap-y-1 mt-2 text-xs text-muted-foreground">{event.className && <span className="inline-flex items-center gap-1"><Building2 className="w-3 h-3" />{event.className}</span>}{event.actorName && <span className="inline-flex items-center gap-1"><UserRound className="w-3 h-3" />{event.actorName}</span>}{event.studentName && <span className="inline-flex items-center gap-1"><Users className="w-3 h-3" />{event.studentName}</span>}</div></div>
                    </div>;
                  })}
                </div>
              </>
            )}
          </CardContent>
        </Card>
      )}

      <Card className="border-border/50">
        <CardHeader className="pb-2"><CardTitle className="text-base font-semibold flex items-center gap-2"><Bell className="w-4 h-4 text-primary" /> {copy.notificationHistory} {unreadNotifications.length > 0 && <Badge variant="destructive">{unreadNotifications.length}</Badge>}</CardTitle></CardHeader>
        <CardContent className="space-y-2 max-h-[400px] overflow-y-auto">
          {notifications.length === 0 ? <p className="text-sm text-muted-foreground text-center py-5">{copy.noNotifications}</p> : notifications.map((notification) => {
            const content = describeNotification(notification);
            return <div key={notification.id} className={cn("flex items-start justify-between gap-3 rounded-xl border p-3", notification.read ? "border-border/50 bg-muted/20 opacity-75" : "border-primary/20 bg-primary/[0.03]")}>
              <div className="min-w-0"><div className="flex flex-wrap items-center gap-2"><p className="text-sm font-medium">{content.title}</p>{!notification.read && <Badge variant="secondary" className="text-[10px]">{copy.pending}</Badge>}</div><p className="text-xs text-muted-foreground mt-0.5">{content.message}</p><p className="text-[11px] text-muted-foreground mt-1">{new Date(notification.createdAt).toLocaleString(locale, { dateStyle: "medium", timeStyle: "short" })}</p></div>
              {!notification.read && <Button variant="ghost" size="sm" className="shrink-0" onClick={() => void markNotificationRead(notification.id)}>{copy.markRead}</Button>}
            </div>;
          })}
        </CardContent>
      </Card>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <Card className="border-destructive/30 bg-destructive/5"><CardContent className="p-4"><div className="flex items-center gap-3"><Bell className="w-5 h-5 text-destructive" /><div><p className="text-2xl font-bold font-mono text-destructive">{criticalCount}</p><p className="text-xs text-muted-foreground">{t("alerts.critical")}</p></div></div><p className="mt-2 text-xs leading-relaxed text-muted-foreground">{alertCardDescriptions.critical}</p></CardContent></Card>
        <Card className="border-warning/30 bg-warning/5"><CardContent className="p-4"><div className="flex items-center gap-3"><Bell className="w-5 h-5 text-warning" /><div><p className="text-2xl font-bold font-mono text-warning">{warningCount}</p><p className="text-xs text-muted-foreground">{t("alerts.warning")}</p></div></div><p className="mt-2 text-xs leading-relaxed text-muted-foreground">{alertCardDescriptions.warning}</p></CardContent></Card>
        <Card className="border-border/50"><CardContent className="p-4"><div className="flex items-center gap-3"><CheckCheck className="w-5 h-5 text-primary" /><div><p className="text-2xl font-bold font-mono">{resolvedAlerts.length}</p><p className="text-xs text-muted-foreground">{t("alerts.resolved")}</p></div></div><p className="mt-2 text-xs leading-relaxed text-muted-foreground">{alertCardDescriptions.resolved}</p></CardContent></Card>
      </div>

      <div>
        <h2 className="text-base font-semibold mb-3">{t("alerts.activeTitle")}</h2>
        <div className="grid gap-3">
          {activeAlerts.length === 0 ? <Card className="border-dashed border-2"><CardContent className="p-6 text-center"><CheckCheck className="w-10 h-10 text-green-500 mx-auto mb-2" /><p className="text-muted-foreground font-medium">{t("alerts.noneTitle")}</p><p className="text-sm text-muted-foreground">{t("alerts.allGood")}</p></CardContent></Card> : activeAlerts.map((alert) => {
            const student = students.find((candidate) => candidate.id === alert.studentId);
            return <Card key={alert.id} className={cn("border-s-4", alert.level === "critical" ? "border-s-destructive" : "border-s-warning")}><CardContent className="p-4 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3"><div className="flex items-start gap-3"><Bell className={cn("w-5 h-5 mt-0.5 shrink-0", alert.level === "critical" ? "text-destructive" : "text-warning")} /><div><div className="flex items-center gap-2 flex-wrap"><Badge variant={alert.level === "critical" ? "destructive" : "secondary"}>{alert.level === "critical" ? t("alerts.criticalBadge") : t("alerts.warningBadge")}</Badge><span className="text-xs text-muted-foreground">{new Date(alert.date).toLocaleDateString(locale)}</span></div><p className="font-semibold mt-1">{student ? `${student.firstName} ${student.lastName}` : t("alerts.unknownStudent")}</p><p className="text-sm text-muted-foreground">{alert.cause}</p></div></div><div className="flex items-center gap-2 self-end sm:self-auto">{student && user?.role !== "parent" && <Link to={`/students/${alert.studentId}`}><Button variant="outline" size="sm" className="gap-1">{t("alerts.profile")} <ArrowRight className="w-3 h-3 rtl:rotate-180" /></Button></Link>}{canResolveAlerts && <Button variant="outline" size="sm" onClick={() => void markAlertResolved(alert.id)}><CheckCheck className="w-3.5 h-3.5 me-1" /> {t("alerts.resolve")}</Button>}</div></CardContent></Card>;
          })}
        </div>
      </div>
    </div>
  );
}
