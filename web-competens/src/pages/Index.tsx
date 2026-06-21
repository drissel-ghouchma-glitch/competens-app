import { Navigate } from "react-router-dom";
import { useAppStore } from "@/stores/app-store";
import { useEffect } from "react";

export default function IndexPage() {
  const initDemo = useAppStore((s) => s.initDemoData);
  const initialized = useAppStore((s) => s.initialized);

  useEffect(() => { initDemo(); }, [initDemo]);

  if (!initialized) return null;
  return <Navigate to="/dashboard" replace />;
}
