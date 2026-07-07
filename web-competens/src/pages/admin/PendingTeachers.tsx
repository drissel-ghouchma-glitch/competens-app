import { useState, useEffect, useCallback } from "react";
import { supabase } from "@/lib/supabase";
import { useI18n } from "@/i18n";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import {
  CheckCircle2, XCircle, Clock, UserCog, RefreshCw, Building2, Loader2, Users, UserCheck,
} from "lucide-react";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription,
} from "@/components/ui/dialog";
import { toast } from "sonner";

interface PendingProfile {
  id: string;
  email: string;
  full_name: string;
  role: string;
  phone: string | null;
  status: string;
  created_at: string;
}

interface ClassOption {
  id: string;
  name: string;
  levelCode?: string;
}

interface StudentOption {
  id: string;
  firstName: string;
  lastName: string;
  className?: string;
}

export default function PendingTeachersPage() {
  const { t, lang } = useI18n();
  const locale = lang === "ar" ? "ar-MA" : "fr-FR";
  const [profiles, setProfiles] = useState<PendingProfile[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState<string | null>(null);

  // Assign-classes dialog state (teachers)
  const [assignTarget, setAssignTarget] = useState<PendingProfile | null>(null);
  const [allClasses, setAllClasses] = useState<ClassOption[]>([]);
  const [selectedClassIds, setSelectedClassIds] = useState<string[]>([]);
  const [classesLoading, setClassesLoading] = useState(false);
  const [assignError, setAssignError] = useState("");

  // Link-children dialog state (parents)
  const [linkTarget, setLinkTarget] = useState<PendingProfile | null>(null);
  const [allStudents, setAllStudents] = useState<StudentOption[]>([]);
  const [selectedStudentIds, setSelectedStudentIds] = useState<string[]>([]);
  const [studentsLoading, setStudentsLoading] = useState(false);
  const [linkError, setLinkError] = useState("");

  const fetchPending = useCallback(async () => {
    if (!supabase) { toast.error(t("pending.supabaseNotConfigured")); setIsLoading(false); return; }
    setIsLoading(true);
    const { data, error } = await supabase
      .from("profiles")
      .select("id, email, full_name, role, phone, status, created_at")
      .in("role", ["professeur", "parent"])
      .in("status", ["pending", "suspended"])
      .order("created_at", { ascending: false });

    if (error) {
      toast.error(`${t("common.error")}: ${error.message}`);
    } else {
      setProfiles(data ?? []);
    }
    setIsLoading(false);
  }, [t]);

  useEffect(() => { fetchPending(); }, [fetchPending]);

  // Open assign dialog — also fetch all classes
  const openAssignDialog = useCallback(async (profile: PendingProfile) => {
    if (!supabase) return;
    setAssignTarget(profile);
    setSelectedClassIds([]);
    setAssignError("");
    setClassesLoading(true);

    const { data, error } = await supabase
      .from("classes")
      .select("id, name, levels(code)")
      .eq("is_archived", false)
      .order("name");

    if (error) {
      setAssignError(t("pending.loadClassError"));
    } else {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      setAllClasses((data ?? []).map((c: any) => ({
        id: c.id,
        name: c.name,
        levelCode: c.levels?.code,
      })));
    }
    setClassesLoading(false);
  }, [t]);

  const toggleClass = (id: string) => {
    setSelectedClassIds((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]
    );
  };

  // Approve + assign classes
  const handleApproveAndAssign = async () => {
    if (!supabase || !assignTarget) return;
    setActionLoading(assignTarget.id);
    setAssignError("");
    try {
      // 1. Activate the teacher account
      const { error: e1 } = await supabase
        .from("profiles")
        .update({ status: "active" })
        .eq("id", assignTarget.id);
      if (e1) throw new Error(e1.message);

      // 2. Assign selected classes (if any)
      if (selectedClassIds.length > 0) {
        const rows = selectedClassIds.map((cId) => ({
          teacher_id: assignTarget.id,
          class_id: cId,
        }));
        const { error: e2 } = await supabase
          .from("teacher_class_assignments")
          .upsert(rows, { onConflict: "teacher_id,class_id", ignoreDuplicates: true });
        if (e2) throw new Error(e2.message);
      }

      toast.success(t("pending.activated", { name: assignTarget.full_name }));
      setAssignTarget(null);
      setProfiles((prev) => prev.filter((p) => p.id !== assignTarget.id));
    } catch (e: unknown) {
      setAssignError(e instanceof Error ? e.message : t("common.error"));
    } finally {
      setActionLoading(null);
    }
  };

  // Open link-children dialog for parents
  const openLinkDialog = useCallback(async (profile: PendingProfile) => {
    if (!supabase) return;
    setLinkTarget(profile);
    setSelectedStudentIds([]);
    setLinkError("");
    setStudentsLoading(true);
    const { data, error } = await supabase
      .from("students")
      .select("id, first_name, last_name, classes(name)")
      .order("last_name");
    if (error) {
      setLinkError(t("pending.loadStudentError"));
    } else {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      setAllStudents((data ?? []).map((s: any) => ({
        id: s.id,
        firstName: s.first_name,
        lastName: s.last_name,
        className: s.classes?.name,
      })));
    }
    setStudentsLoading(false);
  }, [t]);

  const toggleStudent = (id: string) =>
    setSelectedStudentIds((prev) => prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]);

  // Approve parent + link children
  const handleApproveParent = async () => {
    if (!supabase || !linkTarget) return;
    setActionLoading(linkTarget.id);
    setLinkError("");
    try {
      const { error: e1 } = await supabase.from("profiles").update({ status: "active" }).eq("id", linkTarget.id);
      if (e1) throw new Error(e1.message);

      if (selectedStudentIds.length > 0) {
        const rows = selectedStudentIds.map((sid) => ({ parent_id: linkTarget.id, student_id: sid }));
        const { error: e2 } = await supabase
          .from("parent_student")
          .upsert(rows, { onConflict: "parent_id,student_id", ignoreDuplicates: true });
        if (e2) throw new Error(e2.message);
      }

      toast.success(t("pending.activated", { name: linkTarget.full_name }));
      setLinkTarget(null);
      setProfiles((prev) => prev.filter((p) => p.id !== linkTarget.id));
    } catch (e: unknown) {
      setLinkError(e instanceof Error ? e.message : t("common.error"));
    } finally {
      setActionLoading(null);
    }
  };

  const suspendTeacher = async (id: string) => {
    if (!supabase) return;
    setActionLoading(id);
    const { error } = await supabase.from("profiles").update({ status: "suspended" }).eq("id", id);
    if (error) {
      toast.error(t("pending.suspendError"));
    } else {
      toast.success(t("pending.suspendedToast"));
      setProfiles((prev) => prev.filter((p) => p.id !== id));
    }
    setActionLoading(null);
  };

  const reactivate = async (id: string) => {
    if (!supabase) return;
    setActionLoading(id);
    const { error } = await supabase.from("profiles").update({ status: "active" }).eq("id", id);
    if (error) {
      toast.error(t("pending.reactivateError"));
    } else {
      toast.success(t("pending.reactivatedToast"));
      setProfiles((prev) => prev.filter((p) => p.id !== id));
    }
    setActionLoading(null);
  };

  const pendingTeachers  = profiles.filter((p) => p.status === "pending"   && p.role === "professeur");
  const pendingParents   = profiles.filter((p) => p.status === "pending"   && p.role === "parent");
  const suspendedList    = profiles.filter((p) => p.status === "suspended");

  const ProfileCard = ({ p, isParent }: { p: PendingProfile; isParent?: boolean }) => (
    <Card className="border-border/60">
      <CardContent className="p-4 flex items-center justify-between gap-4 flex-wrap">
        <div className="space-y-0.5">
          <div className="flex items-center gap-2">
            <p className="font-semibold text-foreground">{p.full_name}</p>
            <Badge variant="secondary" className="text-xs">{isParent ? t("pending.parent") : t("pending.teacher")}</Badge>
          </div>
          <p className="text-sm text-muted-foreground">{p.email}</p>
          {p.phone && <p className="text-xs text-muted-foreground">{p.phone}</p>}
          <p className="text-xs text-muted-foreground">
            {new Date(p.created_at).toLocaleDateString(locale, { day: "2-digit", month: "long", year: "numeric" })}
          </p>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <Button size="sm"
            onClick={() => isParent ? openLinkDialog(p) : openAssignDialog(p)}
            disabled={!!actionLoading}
            className="bg-green-600 hover:bg-green-700 text-white gap-1"
          >
            {isParent
              ? <><UserCheck className="w-3.5 h-3.5" /> {t("pending.approveLink")}</>
              : <><Building2 className="w-3.5 h-3.5" /> {t("pending.approveAssign")}</>
            }
          </Button>
          <Button size="sm" variant="destructive" onClick={() => suspendTeacher(p.id)} disabled={!!actionLoading} className="gap-1">
            <XCircle className="w-3.5 h-3.5" /> {t("pending.refuse")}
          </Button>
        </div>
      </CardContent>
    </Card>
  );

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground flex items-center gap-2">
            <UserCog className="w-6 h-6 text-primary" /> {t("pending.title")}
          </h1>
          <p className="text-muted-foreground text-sm mt-1">
            {t("pending.subtitle")}
          </p>
        </div>
        <Button variant="outline" size="sm" onClick={fetchPending} disabled={isLoading}>
          <RefreshCw className={`w-4 h-4 me-2 ${isLoading ? "animate-spin" : ""}`} /> {t("common.refresh")}
        </Button>
      </div>

      {isLoading ? (
        <div className="flex items-center justify-center h-40">
          <Loader2 className="w-8 h-8 animate-spin text-muted-foreground" />
        </div>
      ) : pendingTeachers.length === 0 && pendingParents.length === 0 && suspendedList.length === 0 ? (
        <div className="flex flex-col items-center justify-center h-40 gap-3 text-muted-foreground">
          <CheckCircle2 className="w-10 h-10 text-green-400" />
          <p className="text-sm">{t("pending.none")}</p>
        </div>
      ) : (
        <>
          {pendingTeachers.length > 0 && (
            <div className="space-y-3">
              <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide flex items-center gap-2">
                <Clock className="w-4 h-4 text-orange-400" /> {t("pending.teachersWaiting", { count: pendingTeachers.length })}
              </h2>
              {pendingTeachers.map((p) => <ProfileCard key={p.id} p={p} />)}
            </div>
          )}

          {pendingParents.length > 0 && (
            <div className="space-y-3">
              <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide flex items-center gap-2">
                <Users className="w-4 h-4 text-amber-500" /> {t("pending.parentsWaiting", { count: pendingParents.length })}
              </h2>
              {pendingParents.map((p) => <ProfileCard key={p.id} p={p} isParent />)}
            </div>
          )}

          {suspendedList.length > 0 && (
            <div className="space-y-3">
              <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide flex items-center gap-2">
                <XCircle className="w-4 h-4 text-destructive" /> {t("pending.suspended", { count: suspendedList.length })}
              </h2>
              {suspendedList.map((p) => (
                <Card key={p.id} className="border-border/60">
                  <CardContent className="p-4 flex items-center justify-between gap-4 flex-wrap">
                    <div className="space-y-0.5">
                      <p className="font-semibold text-foreground">{p.full_name}</p>
                      <p className="text-sm text-muted-foreground">{p.email}</p>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      <Badge variant="destructive">{t("pending.suspendedBadge")}</Badge>
                      <Button size="sm" onClick={() => reactivate(p.id)} disabled={!!actionLoading} className="bg-green-600 hover:bg-green-700 text-white gap-1">
                        <CheckCircle2 className="w-3.5 h-3.5" /> {t("pending.reactivate")}
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </>
      )}

      {/* Link Children Dialog (parents) */}
      <Dialog open={!!linkTarget} onOpenChange={(o) => { if (!o) setLinkTarget(null); }}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <UserCheck className="w-5 h-5 text-primary" /> {t("pending.linkTitle")}
            </DialogTitle>
            <DialogDescription>
              {t("pending.linkDesc", { name: linkTarget?.full_name ?? "" })}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 pt-2">
            {linkError && <div className="p-3 rounded-lg bg-destructive/10 text-destructive text-sm">{linkError}</div>}
            {studentsLoading ? (
              <div className="flex justify-center py-6"><Loader2 className="w-6 h-6 animate-spin text-muted-foreground" /></div>
            ) : allStudents.length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-4">{t("pending.noStudents")}</p>
            ) : (
              <div className="max-h-64 overflow-y-auto space-y-2 pe-1">
                {allStudents.map((s) => (
                  <div key={s.id} className="flex items-center gap-3 p-2 rounded-lg hover:bg-muted/40 cursor-pointer" onClick={() => toggleStudent(s.id)}>
                    <Checkbox checked={selectedStudentIds.includes(s.id)} onCheckedChange={() => toggleStudent(s.id)} id={`s-${s.id}`} />
                    <Label htmlFor={`s-${s.id}`} className="cursor-pointer flex-1 flex items-center justify-between gap-2">
                      <span className="font-medium text-sm">{s.firstName} {s.lastName}</span>
                      {s.className && <Badge variant="secondary" className="text-xs">{s.className}</Badge>}
                    </Label>
                  </div>
                ))}
              </div>
            )}
            {selectedStudentIds.length > 0 && (
              <p className="text-xs text-primary font-medium">{t("pending.studentsSelected", { count: selectedStudentIds.length })}</p>
            )}
            <div className="flex gap-2 justify-end pt-2">
              <Button variant="outline" onClick={() => setLinkTarget(null)} disabled={!!actionLoading}>{t("common.cancel")}</Button>
              <Button onClick={handleApproveParent} disabled={!!actionLoading} className="bg-green-600 hover:bg-green-700 text-white">
                {actionLoading ? <Loader2 className="w-4 h-4 animate-spin me-2" /> : <CheckCircle2 className="w-4 h-4 me-2" />}
                {t("pending.confirmActivation")}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Assign Classes Dialog */}
      <Dialog open={!!assignTarget} onOpenChange={(o) => { if (!o) setAssignTarget(null); }}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Building2 className="w-5 h-5 text-primary" />
              {t("pending.assignTitle")}
            </DialogTitle>
            <DialogDescription>
              {t("pending.assignDesc", { name: assignTarget?.full_name ?? "" })}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 pt-2">
            {assignError && (
              <div className="p-3 rounded-lg bg-destructive/10 text-destructive text-sm">{assignError}</div>
            )}

            {classesLoading ? (
              <div className="flex justify-center py-6">
                <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
              </div>
            ) : allClasses.length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-4">
                {t("pending.noClasses")}
              </p>
            ) : (
              <div className="max-h-64 overflow-y-auto space-y-2 pe-1">
                {allClasses.map((cls) => (
                  <div key={cls.id} className="flex items-center gap-3 p-2 rounded-lg hover:bg-muted/40 cursor-pointer"
                    onClick={() => toggleClass(cls.id)}>
                    <Checkbox
                      checked={selectedClassIds.includes(cls.id)}
                      onCheckedChange={() => toggleClass(cls.id)}
                      id={`cls-${cls.id}`}
                    />
                    <Label htmlFor={`cls-${cls.id}`} className="cursor-pointer flex-1 flex items-center gap-2">
                      <span className="font-medium">{cls.name}</span>
                      {cls.levelCode && (
                        <Badge variant="secondary" className="text-xs font-mono">{cls.levelCode}</Badge>
                      )}
                    </Label>
                  </div>
                ))}
              </div>
            )}

            {selectedClassIds.length > 0 && (
              <p className="text-xs text-primary font-medium">
                {t("pending.classesSelected", { count: selectedClassIds.length })}
              </p>
            )}

            <div className="flex gap-2 justify-end pt-2">
              <Button variant="outline" onClick={() => setAssignTarget(null)} disabled={!!actionLoading}>
                {t("common.cancel")}
              </Button>
              <Button
                onClick={handleApproveAndAssign}
                disabled={!!actionLoading}
                className="bg-green-600 hover:bg-green-700 text-white"
              >
                {actionLoading ? <Loader2 className="w-4 h-4 animate-spin me-2" /> : <CheckCircle2 className="w-4 h-4 me-2" />}
                {t("pending.confirmActivation")}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
