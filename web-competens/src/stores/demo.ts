import { create } from "zustand";
import { persist } from "zustand/middleware";

interface DemoState {
  isDemoMode: boolean;
  enableDemo: () => void;
  disableDemo: () => void;
}

export const useDemoStore = create<DemoState>()(
  persist(
    (set) => ({
      isDemoMode: false,
      enableDemo: () => set({ isDemoMode: true }),
      disableDemo: () => set({ isDemoMode: false }),
    }),
    { name: "competens-demo" }
  )
);
