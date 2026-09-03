import { useCallback, useEffect, useMemo, useState } from "react";
import { useAuth } from "@/hooks/use-auth";
import { supabase } from "@/lib/supabase";
import type { ActivityEvent, ActivityEventType } from "@/types";

export interface ActivityFeedFilters {
  date: string;
  classId?: string;
  actorId?: string;
  eventType?: ActivityEventType | "all";
  studentQuery?: string;
}

interface RawActivityEvent {
  id: string;
  event_type: ActivityEventType;
  actor_id: string | null;
  class_id: string | null;
  student_id: string | null;
  competency_id: string | null;
  event_date: string;
  payload: Record<string, unknown> | null;
  created_at: string;
}

function isMissingActivityEventsTable(error: unknown): boolean {
  if (!error || typeof error !== "object") return false;
  const candidate = error as { code?: string; message?: string; details?: string; hint?: string };
  const message = [candidate.code, candidate.message, candidate.details, candidate.hint].filter(Boolean).join(" ").toLowerCase();
  return message.includes("activity_events") && (message.includes("pgrst205") || message.includes("42p01") || message.includes("does not exist") || message.includes("could not find"));
}

export function useActivityFeed(filters: ActivityFeedFilters) {
  const { user } = useAuth();
  const canView = user?.role === "admin" || user?.role === "directeur" || user?.role === "professeur";
  const [events, setEvents] = useState<ActivityEvent[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [migrationMissing, setMigrationMissing] = useState(false);

  const fetchEvents = useCallback(async () => {
    if (!supabase || !user || !canView) {
      setEvents([]);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      let query = supabase
        .from("activity_events")
        .select("id,event_type,actor_id,class_id,student_id,competency_id,event_date,payload,created_at")
        .eq("event_date", filters.date)
        .order("created_at", { ascending: false });
      if (filters.classId && filters.classId !== "all") query = query.eq("class_id", filters.classId);
      if (filters.actorId && filters.actorId !== "all") query = query.eq("actor_id", filters.actorId);
      if (filters.eventType && filters.eventType !== "all") query = query.eq("event_type", filters.eventType);

      const { data, error: eventError } = await query;
      if (eventError) {
        if (isMissingActivityEventsTable(eventError)) {
          setMigrationMissing(true);
          setEvents([]);
          return;
        }
        throw eventError;
      }
      setMigrationMissing(false);
      const rows = (data ?? []) as RawActivityEvent[];
      const actorIds = [...new Set(rows.map((event) => event.actor_id).filter(Boolean))] as string[];
      const classIds = [...new Set(rows.map((event) => event.class_id).filter(Boolean))] as string[];
      const studentIds = [...new Set(rows.map((event) => event.student_id).filter(Boolean))] as string[];
      const competencyIds = [...new Set(rows.map((event) => event.competency_id).filter(Boolean))] as string[];

      const [actorsResult, classesResult, studentsResult, competenciesResult] = await Promise.all([
        actorIds.length ? supabase.from("profiles").select("id,full_name").in("id", actorIds) : Promise.resolve({ data: [], error: null }),
        classIds.length ? supabase.from("classes").select("id,name").in("id", classIds) : Promise.resolve({ data: [], error: null }),
        studentIds.length ? supabase.from("students").select("id,first_name,last_name").in("id", studentIds) : Promise.resolve({ data: [], error: null }),
        competencyIds.length ? supabase.from("competencies").select("id,code,title").in("id", competencyIds) : Promise.resolve({ data: [], error: null }),
      ]);
      if (actorsResult.error) throw actorsResult.error;
      if (classesResult.error) throw classesResult.error;
      if (studentsResult.error) throw studentsResult.error;
      if (competenciesResult.error) throw competenciesResult.error;

      const actorNames = new Map((actorsResult.data ?? []).map((actor) => [actor.id, actor.full_name ?? ""]));
      const classNames = new Map((classesResult.data ?? []).map((classe) => [classe.id, classe.name]));
      const studentNames = new Map((studentsResult.data ?? []).map((student) => [student.id, `${student.last_name} ${student.first_name}`.trim()]));
      const competencyData = new Map((competenciesResult.data ?? []).map((competency) => [competency.id, competency]));
      const queryText = filters.studentQuery?.trim().toLocaleLowerCase() ?? "";

      setEvents(rows
        .map((event): ActivityEvent => {
          const competency = event.competency_id ? competencyData.get(event.competency_id) : undefined;
          return {
            id: event.id, eventType: event.event_type, actorId: event.actor_id ?? undefined,
            actorName: event.actor_id ? actorNames.get(event.actor_id) : undefined,
            classId: event.class_id ?? undefined, className: event.class_id ? classNames.get(event.class_id) : undefined,
            studentId: event.student_id ?? undefined, studentName: event.student_id ? studentNames.get(event.student_id) : undefined,
            competencyId: event.competency_id ?? undefined, competencyCode: competency?.code,
            competencyTitle: competency?.title, eventDate: event.event_date, payload: event.payload ?? {}, createdAt: event.created_at,
          };
        })
        .filter((event) => !queryText || `${event.studentName ?? ""} ${event.className ?? ""}`.toLocaleLowerCase().includes(queryText)));
    } catch (cause: unknown) {
      setError(cause instanceof Error ? cause.message : "Erreur de chargement de l'activité");
    } finally {
      setLoading(false);
    }
  }, [canView, filters.actorId, filters.classId, filters.date, filters.eventType, filters.studentQuery, user]);

  useEffect(() => { void fetchEvents(); }, [fetchEvents]);

  useEffect(() => {
    if (!supabase || !user || !canView) return;
    const channel = supabase
      .channel(`activity-feed-${user.id}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "activity_events" }, () => void fetchEvents())
      .subscribe();
    return () => { void supabase.removeChannel(channel); };
  }, [canView, fetchEvents, user]);

  return useMemo(() => ({ events, loading, error, migrationMissing, refetch: fetchEvents }), [error, events, fetchEvents, loading, migrationMissing]);
}
