import { CloudOff, CloudUpload, RefreshCw, TriangleAlert, Wifi } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useI18n } from "@/i18n";
import { useOfflineSync } from "@/lib/offline-sync";

export function OfflineSyncIndicator() {
  const { t } = useI18n();
  const { isOnline, isSyncing, pendingCount, conflictCount, syncNow } = useOfflineSync();

  if (!isOnline) {
    return (
      <div className="flex items-center gap-1.5 text-xs text-amber-700 dark:text-amber-400" title={t("offline.offlineHint")}>
        <CloudOff className="h-4 w-4" />
        <span>{t("offline.offline")}</span>
        {pendingCount > 0 && <span className="font-semibold">({pendingCount})</span>}
      </div>
    );
  }

  if (conflictCount > 0) {
    return (
      <div className="flex items-center gap-1.5 text-xs text-destructive" title={t("offline.conflictHint")}>
        <TriangleAlert className="h-4 w-4" />
        <span>{t("offline.reviewNeeded", { count: conflictCount })}</span>
      </div>
    );
  }

  if (pendingCount > 0 || isSyncing) {
    return (
      <Button variant="ghost" size="sm" onClick={() => void syncNow()} disabled={isSyncing} className="h-8 gap-1.5 px-2 text-xs text-muted-foreground">
        {isSyncing ? <RefreshCw className="h-4 w-4 animate-spin" /> : <CloudUpload className="h-4 w-4" />}
        {isSyncing ? t("offline.syncing") : t("offline.pending", { count: pendingCount })}
      </Button>
    );
  }

  return (
    <div className="flex items-center gap-1.5 text-xs text-muted-foreground" title={t("offline.syncedHint")}>
      <Wifi className="h-4 w-4 text-green-600" />
      <span>{t("offline.synced")}</span>
    </div>
  );
}
