import { useState, useEffect, useCallback, useMemo } from "react";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/hooks/use-auth";
import { createOfflineOperation, sendOperation, useOfflineSync } from "@/lib/offline-sync";
import { isNetworkError } from "@/lib/offline-queue";

export type RequestType = "add_student" | "add_competency" | "assign_class";
export type RequestStatus = "pending" | "approved" | "rejected";

export interface AdminRequest {
  id: string;
  type: RequestType;
  status: RequestStatus;
  teacherId: string;
  teacherName: string;
  teacherEmail: string;
  data: Record<string, unknown>;
  adminNote?: string;
  reviewedAt?: string;
  createdAt: string;
}

export interface RequestSubmissionResult {
  queued: boolean;
}

export function useRequests() {
  const { user } = useAuth();
  const { enqueue, operations, syncRevision } = useOfflineSync();
  const [requests, setRequests] = useState<AdminRequest[]>([]);
  const [pendingCount, setPendingCount] = useState(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const queuedRequests = useMemo(() => operations
    .filter((operation) => operation.kind === "admin_request")
    .map((operation): AdminRequest => ({
      id: operation.id,
      type: operation.payload.type,
      status: "pending",
      teacherId: operation.userId,
      teacherName: user?.fullName ?? "",
      teacherEmail: user?.email ?? "",
      data: operation.payload.data,
      createdAt: operation.createdAt,
    })), [operations, user?.email, user?.fullName]);

  const fetchRequests = useCallback(async () => {
    if (!supabase || !user) return;
    setLoading(true);
    setError(null);
    try {
      let query = supabase
        .from("admin_requests")
        .select("*, teacher:profiles!teacher_id(full_name, email)")
        .order("created_at", { ascending: false });

      // Teachers only see their own; admins see all pending
      if (user.role === "professeur") {
        query = query.eq("teacher_id", user.id);
      } else {
        query = query.eq("status", "pending");
      }

      const { data, error: err } = await query;
      if (err) throw err;

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const mapped: AdminRequest[] = (data ?? []).map((r: any) => ({
        id: r.id,
        type: r.type as RequestType,
        status: r.status as RequestStatus,
        teacherId: r.teacher_id,
        teacherName: r.teacher?.full_name ?? "Inconnu",
        teacherEmail: r.teacher?.email ?? "",
        data: r.data ?? {},
        adminNote: r.admin_note ?? undefined,
        reviewedAt: r.reviewed_at ?? undefined,
        createdAt: r.created_at,
      }));

      const merged = [...mapped, ...queuedRequests].sort((left, right) => right.createdAt.localeCompare(left.createdAt));
      setRequests(merged);
      setPendingCount(merged.filter((r) => r.status === "pending").length);
    } catch (e: unknown) {
      setRequests(queuedRequests);
      setPendingCount(queuedRequests.length);
      setError(e instanceof Error && !isNetworkError(e) ? e.message : null);
    } finally {
      setLoading(false);
    }
  }, [queuedRequests, user]);

  useEffect(() => {
    if (user) fetchRequests();
  }, [user, fetchRequests]);

  useEffect(() => {
    if (syncRevision > 0 && user) void fetchRequests();
  }, [fetchRequests, syncRevision, user]);

  /** Teacher submits a new request */
  const submitRequest = useCallback(
    async (type: RequestType, data: Record<string, unknown>): Promise<RequestSubmissionResult> => {
      if (!supabase || !user) throw new Error("AUTHENTICATION_REQUIRED");
      const operation = createOfflineOperation({
        userId: user.id,
        kind: "admin_request",
        payload: { type, data },
      });

      if (typeof navigator !== "undefined" && !navigator.onLine) {
        await enqueue(operation);
        return { queued: true };
      }

      try {
        await sendOperation(operation);
        await fetchRequests();
        return { queued: false };
      } catch (error) {
        if (!isNetworkError(error)) throw error;
        await enqueue(operation);
        return { queued: true };
      }
    },
    [enqueue, fetchRequests, user]
  );

  /** Admin approves a request — executes the underlying action then marks approved */
  const approveRequest = useCallback(
    async (request: AdminRequest): Promise<void> => {
      if (!supabase || !user) throw new Error("Non authentifié");

      // ── Execute the action ──────────────────────────────
      if (request.type === "add_student") {
        const d = request.data as {
          firstName: string; lastName: string;
          birthDate: string; gender: "M" | "F"; classId: string;
        };
        const { error: err } = await supabase.from("students").insert({
          first_name: d.firstName,
          last_name: d.lastName,
          birth_date: d.birthDate || null,
          gender: d.gender,
          class_id: d.classId || null,
        });
        if (err) throw new Error(err.message);
        // Sync student count
        if (d.classId) {
          const { count } = await supabase
            .from("students")
            .select("*", { count: "exact", head: true })
            .eq("class_id", d.classId);
          await supabase.from("classes").update({ student_count: count ?? 0 }).eq("id", d.classId);
        }
      }

      if (request.type === "add_competency") {
        const d = request.data as {
          code: string; title: string; description: string;
          pedagogicalAdvice: string; order: number;
        };
        const { error: err } = await supabase.from("competencies").insert({
          code: d.code,
          title: d.title,
          description: d.description,
          pedagogical_advice: d.pedagogicalAdvice,
          order: d.order,
        });
        if (err) throw new Error(err.message);
      }

      if (request.type === "assign_class") {
        const d = request.data as { classIds: string[] };
        if ((d.classIds ?? []).length > 0) {
          const rows = d.classIds.map((cId) => ({
            teacher_id: request.teacherId,
            class_id: cId,
          }));
          const { error: err } = await supabase
            .from("teacher_class_assignments")
            .upsert(rows, { onConflict: "teacher_id,class_id", ignoreDuplicates: true });
          if (err) throw new Error(err.message);
        }
      }

      // ── Mark as approved ────────────────────────────────
      const { error: err2 } = await supabase
        .from("admin_requests")
        .update({
          status: "approved",
          reviewed_by: user.id,
          reviewed_at: new Date().toISOString(),
        })
        .eq("id", request.id);
      if (err2) throw new Error(err2.message);

      await fetchRequests();
    },
    [user, fetchRequests]
  );

  /** Admin rejects a request */
  const rejectRequest = useCallback(
    async (id: string, adminNote?: string): Promise<void> => {
      if (!supabase || !user) throw new Error("Non authentifié");
      const { error: err } = await supabase
        .from("admin_requests")
        .update({
          status: "rejected",
          reviewed_by: user.id,
          reviewed_at: new Date().toISOString(),
          admin_note: adminNote ?? null,
        })
        .eq("id", id);
      if (err) throw new Error(err.message);
      await fetchRequests();
    },
    [user, fetchRequests]
  );

  return {
    requests,
    pendingCount,
    loading,
    error,
    fetchRequests,
    submitRequest,
    approveRequest,
    rejectRequest,
  };
}
