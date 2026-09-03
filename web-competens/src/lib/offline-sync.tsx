import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { useAuth } from "@/hooks/use-auth";
import { supabase } from "@/lib/supabase";
import {
  createOfflineOperation,
  enqueueOfflineOperation,
  isNetworkError,
  isSyncConflict,
  listOfflineOperations,
  removeOfflineOperation,
  updateOfflineOperation,
  type OfflineOperation,
} from "@/lib/offline-queue";

interface OfflineSyncContextValue {
  isOnline: boolean;
  isSyncing: boolean;
  pendingCount: number;
  conflictCount: number;
  operations: OfflineOperation[];
  syncRevision: number;
  enqueue: (operation: OfflineOperation) => Promise<void>;
  syncNow: () => Promise<void>;
}

const OfflineSyncContext = createContext<OfflineSyncContextValue | null>(null);

async function sendOperation(operation: OfflineOperation): Promise<void> {
  if (!supabase) throw new Error("SUPABASE_UNAVAILABLE");

  if (operation.kind === "attendance") {
    const { classId, date, period, inputs } = operation.payload;
    const { error } = await supabase.rpc("submit_attendance_register", {
      p_operation_id: operation.id,
      p_class_id: classId,
      p_date: date,
      p_period: period,
      p_records: inputs.map((input) => ({ student_id: input.studentId, status: input.status })),
    });
    if (error) throw new Error(error.message);
    return;
  }

  if (operation.kind === "evaluation") {
    const { classId, competencyId, date, studentIds } = operation.payload;
    const { error } = await supabase.rpc("submit_daily_evaluation", {
      p_operation_id: operation.id,
      p_class_id: classId,
      p_competency_id: competencyId,
      p_date: date,
      p_student_ids: studentIds,
    });
    if (error) throw new Error(error.message);
    return;
  }

  const { type, data } = operation.payload;
  const { error } = await supabase.from("admin_requests").insert({
    id: operation.id,
    type,
    teacher_id: operation.userId,
    data,
    status: "pending",
  });
  if (error && error.code !== "23505") throw new Error(error.message);
}

export function OfflineSyncProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  const [isOnline, setIsOnline] = useState(() => typeof navigator === "undefined" || navigator.onLine);
  const [isSyncing, setIsSyncing] = useState(false);
  const [operations, setOperations] = useState<OfflineOperation[]>([]);
  const [syncRevision, setSyncRevision] = useState(0);
  const syncingRef = useRef(false);

  const refreshOperations = useCallback(async () => {
    if (!user?.id) {
      setOperations([]);
      return;
    }
    try {
      setOperations(await listOfflineOperations(user.id));
    } catch {
      setOperations([]);
    }
  }, [user?.id]);

  const syncNow = useCallback(async () => {
    if (!user?.id || !isOnline || syncingRef.current) return;
    syncingRef.current = true;
    setIsSyncing(true);
    let syncedAny = false;
    try {
      const queued = await listOfflineOperations(user.id);
      for (const operation of queued) {
        if (operation.state === "conflict") continue;
        try {
          await sendOperation(operation);
          await removeOfflineOperation(operation.id);
          syncedAny = true;
        } catch (error) {
          if (isNetworkError(error)) {
            await updateOfflineOperation({
              ...operation,
              attempts: operation.attempts + 1,
              lastError: error instanceof Error ? error.message : "NETWORK_ERROR",
            });
            break;
          }
          if (isSyncConflict(error)) {
            await updateOfflineOperation({
              ...operation,
              state: "conflict",
              lastError: error instanceof Error ? error.message : "SYNC_CONFLICT",
            });
            continue;
          }
          await updateOfflineOperation({
            ...operation,
            state: "conflict",
            lastError: error instanceof Error ? error.message : "SYNC_ERROR",
          });
        }
      }
    } catch {
      // The operation remains in IndexedDB and will be retried on the next connection.
    } finally {
      syncingRef.current = false;
      setIsSyncing(false);
      await refreshOperations();
      if (syncedAny) setSyncRevision((value) => value + 1);
    }
  }, [isOnline, refreshOperations, user?.id]);

  const enqueue = useCallback(async (operation: OfflineOperation) => {
    await enqueueOfflineOperation(operation);
    await refreshOperations();
    // A request may fail during a brief connection drop while navigator.onLine
    // still reports true. Retry it once immediately through the durable queue.
    if (isOnline) void syncNow();
  }, [isOnline, refreshOperations, syncNow]);

  useEffect(() => {
    void refreshOperations();
  }, [refreshOperations]);

  useEffect(() => {
    const handleOnline = () => setIsOnline(true);
    const handleOffline = () => setIsOnline(false);
    window.addEventListener("online", handleOnline);
    window.addEventListener("offline", handleOffline);
    return () => {
      window.removeEventListener("online", handleOnline);
      window.removeEventListener("offline", handleOffline);
    };
  }, []);

  useEffect(() => {
    if (isOnline) void syncNow();
  }, [isOnline, syncNow]);

  const value = useMemo<OfflineSyncContextValue>(() => ({
    isOnline,
    isSyncing,
    pendingCount: operations.filter((operation) => operation.state === "queued").length,
    conflictCount: operations.filter((operation) => operation.state === "conflict").length,
    operations,
    syncRevision,
    enqueue,
    syncNow,
  }), [enqueue, isOnline, isSyncing, operations, syncNow, syncRevision]);

  return <OfflineSyncContext.Provider value={value}>{children}</OfflineSyncContext.Provider>;
}

export function useOfflineSync(): OfflineSyncContextValue {
  const context = useContext(OfflineSyncContext);
  if (!context) throw new Error("useOfflineSync must be used within OfflineSyncProvider");
  return context;
}

export { createOfflineOperation, sendOperation };
