import { useState, useEffect, useCallback } from "react";
import { useDemoStore } from "@/stores/demo";
import { useAppStore } from "@/stores/app-store";
import { useAuth } from "@/hooks/use-auth";
import { supabase } from "@/lib/supabase";
import type { Alert, Notification } from "@/types";

export interface UseAlertsReturn {
  alerts: Alert[];
  notifications: Notification[];
  loading: boolean;
  error: string | null;
  refetch: () => Promise<void>;
  markAlertResolved: (alertId: string) => Promise<void>;
  markNotificationRead: (notifId: string) => Promise<void>;
}

export function useAlerts(): UseAlertsReturn {
  const isDemo = useDemoStore((s) => s.isDemoMode);
  const { user } = useAuth();

  // Demo store — used only in demo mode
  const demoAlerts        = useAppStore((s) => s.alerts);
  const demoNotifications = useAppStore((s) => s.notifications);
  const demoMarkAlert     = useAppStore((s) => s.markAlertResolved);
  const demoMarkNotif     = useAppStore((s) => s.markNotificationRead);

  const [sbAlerts, setSbAlerts]             = useState<Alert[]>([]);
  const [sbNotifications, setSbNotifications] = useState<Notification[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError]     = useState<string | null>(null);

  const fetchFromSupabase = useCallback(async () => {
    if (!supabase || !user) return;
    setLoading(true);
    setError(null);
    try {
      const [alertsRes, notifsRes] = await Promise.all([
        supabase
          .from("alerts")
          .select("*")
          .order("created_at", { ascending: false }),
        supabase
          .from("notifications")
          .select("*")
          .eq("user_id", user.id)
          .order("created_at", { ascending: false }),
      ]);

      if (alertsRes.error) throw alertsRes.error;
      if (notifsRes.error) throw notifsRes.error;

      setSbAlerts(
        (alertsRes.data ?? []).map((a) => ({
          id: a.id,
          studentId: a.student_id,
          level: a.level as "warning" | "critical",
          cause: a.cause,
          date: a.date,
          resolved: a.resolved,
          resolvedAt: a.resolved_at ?? undefined,
          createdAt: a.created_at,
        }))
      );

      setSbNotifications(
        (notifsRes.data ?? []).map((n) => ({
          id: n.id,
          userId: n.user_id,
          title: n.title,
          message: n.message,
          read: n.read,
          type: n.type as "alert" | "info" | "evaluation",
          relatedId: n.related_id ?? undefined,
          createdAt: n.created_at,
        }))
      );
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Erreur de chargement des alertes");
    } finally {
      setLoading(false);
    }
  }, [user]);

  useEffect(() => {
    if (!isDemo) fetchFromSupabase();
  }, [isDemo, fetchFromSupabase]);

  const markAlertResolvedReal = useCallback(async (alertId: string) => {
    if (!supabase) return;
    await supabase
      .from("alerts")
      .update({ resolved: true, resolved_at: new Date().toISOString() })
      .eq("id", alertId);
    await fetchFromSupabase();
  }, [fetchFromSupabase]);

  const markNotificationReadReal = useCallback(async (notifId: string) => {
    if (!supabase) return;
    await supabase.from("notifications").update({ read: true }).eq("id", notifId);
    setSbNotifications((prev) => prev.map((n) => n.id === notifId ? { ...n, read: true } : n));
  }, []);

  // Demo async wrappers
  const markAlertResolvedDemo = useCallback(async (id: string) => { demoMarkAlert(id); }, [demoMarkAlert]);
  const markNotifReadDemo     = useCallback(async (id: string) => { demoMarkNotif(id); }, [demoMarkNotif]);

  return {
    alerts:               isDemo ? demoAlerts        : sbAlerts,
    notifications:        isDemo ? demoNotifications : sbNotifications,
    loading,
    error,
    refetch:              fetchFromSupabase,
    markAlertResolved:    isDemo ? markAlertResolvedDemo : markAlertResolvedReal,
    markNotificationRead: isDemo ? markNotifReadDemo     : markNotificationReadReal,
  };
}
