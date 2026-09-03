import { describe, expect, it } from "vitest";
import { createOfflineOperation, isNetworkError, isSyncConflict } from "@/lib/offline-queue";

describe("offline queue operations", () => {
  it("creates a durable attendance operation with queue metadata", () => {
    const operation = createOfflineOperation({
      userId: "teacher-1",
      kind: "attendance",
      payload: {
        classId: "class-1",
        date: "2026-09-03",
        period: "morning",
        inputs: [{ studentId: "student-1", status: "absent" }],
      },
    });

    expect(operation.id).toMatch(/^[0-9a-f-]{36}$/i);
    expect(operation.state).toBe("queued");
    expect(operation.attempts).toBe(0);
    expect(operation.payload.inputs[0].status).toBe("absent");
  });

  it("keeps retryable network failures distinct from conflicts", () => {
    expect(isNetworkError(new Error("Failed to fetch"))).toBe(true);
    expect(isNetworkError({ message: "Network request failed" })).toBe(true);
    expect(isSyncConflict(new Error("ATTENDANCE_REGISTER_LOCKED"))).toBe(true);
    expect(isSyncConflict(new Error("permission denied"))).toBe(false);
  });
});
