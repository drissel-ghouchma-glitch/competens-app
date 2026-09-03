import { useCallback, useEffect, useState } from "react";
import { useAuth } from "@/hooks/use-auth";
import { useDemoStore } from "@/stores/demo";
import { useAppStore } from "@/stores/app-store";
import { supabase } from "@/lib/supabase";

/** Real unread count for the navigation badge, with a Realtime refresh. */
export function useNotificationBadge() {
  const { user } = useAuth();
  const isDemo = useDemoStore((state) => state.isDemoMode);
  const demoCount = useAppStore((state) => state.notifications.filter((notification) => !notification.read).length);
  const [count, setCount] = useState(0);

  const refresh = useCallback(async () => {
    if (!supabase || !user?.id) return;
    const { count: nextCount } = await supabase
      .from("notifications")
      .select("id", { count: "exact", head: true })
      .eq("user_id", user.id)
      .eq("read", false);
    setCount(nextCount ?? 0);
  }, [user?.id]);

  useEffect(() => {
    if (!isDemo) void refresh();
  }, [isDemo, refresh]);

  useEffect(() => {
    if (isDemo || !supabase || !user?.id) return;
    const channel = supabase
      .channel(`notification-badge-${user.id}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "notifications", filter: `user_id=eq.${user.id}` }, () => void refresh())
      .subscribe();
    return () => { void supabase.removeChannel(channel); };
  }, [isDemo, refresh, user?.id]);

  return isDemo ? demoCount : count;
}
