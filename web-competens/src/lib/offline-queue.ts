export type OfflineOperationKind = "attendance" | "evaluation" | "admin_request";

export interface AttendanceOperationPayload {
  classId: string;
  date: string;
  period: "morning" | "afternoon";
  inputs: Array<{ studentId: string; status: "present" | "absent" }>;
}

export interface EvaluationOperationPayload {
  classId: string;
  competencyId: string;
  date: string;
  studentIds: string[];
}

export interface AdminRequestOperationPayload {
  type: "add_student" | "add_competency" | "assign_class";
  data: Record<string, unknown>;
}

export type OfflineOperation =
  | {
      id: string;
      userId: string;
      kind: "attendance";
      payload: AttendanceOperationPayload;
      createdAt: string;
      attempts: number;
      state: "queued" | "conflict";
      lastError?: string;
    }
  | {
      id: string;
      userId: string;
      kind: "evaluation";
      payload: EvaluationOperationPayload;
      createdAt: string;
      attempts: number;
      state: "queued" | "conflict";
      lastError?: string;
    }
  | {
      id: string;
      userId: string;
      kind: "admin_request";
      payload: AdminRequestOperationPayload;
      createdAt: string;
      attempts: number;
      state: "queued" | "conflict";
      lastError?: string;
    };

type NewOfflineOperation = Omit<OfflineOperation, "id" | "createdAt" | "attempts" | "state"> & {
  id?: string;
};

interface OfflineSnapshot<T> {
  id: string;
  userId: string;
  value: T;
  updatedAt: string;
}

const DB_NAME = "competens-offline";
const DB_VERSION = 1;
const OPERATIONS_STORE = "operations";
const SNAPSHOTS_STORE = "snapshots";

let databasePromise: Promise<IDBDatabase> | null = null;

function createUuid(): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }
  return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (character) => {
    const random = (Math.random() * 16) | 0;
    const value = character === "x" ? random : (random & 0x3) | 0x8;
    return value.toString(16);
  });
}

function openDatabase(): Promise<IDBDatabase> {
  if (typeof indexedDB === "undefined") {
    return Promise.reject(new Error("OFFLINE_STORAGE_UNAVAILABLE"));
  }
  if (databasePromise) return databasePromise;

  databasePromise = new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onerror = () => reject(request.error ?? new Error("OFFLINE_STORAGE_UNAVAILABLE"));
    request.onupgradeneeded = () => {
      const database = request.result;
      if (!database.objectStoreNames.contains(OPERATIONS_STORE)) {
        const store = database.createObjectStore(OPERATIONS_STORE, { keyPath: "id" });
        store.createIndex("by_user_created", ["userId", "createdAt"], { unique: false });
      }
      if (!database.objectStoreNames.contains(SNAPSHOTS_STORE)) {
        database.createObjectStore(SNAPSHOTS_STORE, { keyPath: "id" });
      }
    };
    request.onsuccess = () => resolve(request.result);
  });

  return databasePromise;
}

function requestResult<T>(request: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error("OFFLINE_STORAGE_UNAVAILABLE"));
  });
}

export function createOfflineOperation(input: NewOfflineOperation): OfflineOperation {
  return {
    ...input,
    id: input.id ?? createUuid(),
    createdAt: new Date().toISOString(),
    attempts: 0,
    state: "queued",
  } as OfflineOperation;
}

export async function enqueueOfflineOperation(operation: OfflineOperation): Promise<void> {
  const database = await openDatabase();
  const transaction = database.transaction(OPERATIONS_STORE, "readwrite");
  await requestResult(transaction.objectStore(OPERATIONS_STORE).put(operation));
}

export async function listOfflineOperations(userId: string): Promise<OfflineOperation[]> {
  const database = await openDatabase();
  const transaction = database.transaction(OPERATIONS_STORE, "readonly");
  const index = transaction.objectStore(OPERATIONS_STORE).index("by_user_created");
  const range = IDBKeyRange.bound([userId, ""], [userId, "\uffff"]);
  const operations = await requestResult(index.getAll(range));
  return (operations as OfflineOperation[]).sort((left, right) => left.createdAt.localeCompare(right.createdAt));
}

export async function removeOfflineOperation(id: string): Promise<void> {
  const database = await openDatabase();
  const transaction = database.transaction(OPERATIONS_STORE, "readwrite");
  await requestResult(transaction.objectStore(OPERATIONS_STORE).delete(id));
}

export async function updateOfflineOperation(operation: OfflineOperation): Promise<void> {
  await enqueueOfflineOperation(operation);
}

export async function saveOfflineSnapshot<T>(userId: string, key: string, value: T): Promise<void> {
  const database = await openDatabase();
  const transaction = database.transaction(SNAPSHOTS_STORE, "readwrite");
  const snapshot: OfflineSnapshot<T> = {
    id: `${userId}:${key}`,
    userId,
    value,
    updatedAt: new Date().toISOString(),
  };
  await requestResult(transaction.objectStore(SNAPSHOTS_STORE).put(snapshot));
}

export async function loadOfflineSnapshot<T>(userId: string, key: string): Promise<T | null> {
  const database = await openDatabase();
  const transaction = database.transaction(SNAPSHOTS_STORE, "readonly");
  const snapshot = await requestResult(transaction.objectStore(SNAPSHOTS_STORE).get(`${userId}:${key}`));
  return (snapshot as OfflineSnapshot<T> | undefined)?.value ?? null;
}

export function isNetworkError(error: unknown): boolean {
  if (typeof navigator !== "undefined" && navigator.onLine === false) return true;
  const message = error instanceof Error
    ? error.message
    : typeof error === "object" && error !== null && "message" in error
      ? String(error.message)
      : String(error ?? "");
  return /failed to fetch|networkerror|network request failed|network is unreachable|load failed/i.test(message);
}

export function isSyncConflict(error: unknown): boolean {
  const message = error instanceof Error
    ? error.message
    : typeof error === "object" && error !== null && "message" in error
      ? String(error.message)
      : String(error ?? "");
  return /ATTENDANCE_REGISTER_LOCKED|EVALUATION_ALREADY_SAVED|ATTENDANCE_REGISTER_INCOMPLETE|duplicate key value/i.test(message);
}
