import { useState, useCallback } from "react";
import { supabase } from "@/lib/supabase";
import type { Role, UserStatus } from "@/types";

export interface AdminUser {
  id: string;
  email: string;
  fullName: string;
  role: Role;
  status: UserStatus;
  phone?: string;
  createdAt: string;
}

export interface StudentOption {
  id: string;
  firstName: string;
  lastName: string;
  className?: string;
}

export interface UseAdminReturn {
  users: AdminUser[];
  loading: boolean;
  error: string | null;
  fetchUsers: (roleFilter?: Role | "all") => Promise<void>;
  updateUser: (id: string, data: { fullName?: string; phone?: string; role?: Role; status?: UserStatus }) => Promise<void>;
  fetchStudents: () => Promise<StudentOption[]>;
  getParentChildren: (parentId: string) => Promise<string[]>;
  setParentChildren: (parentId: string, studentIds: string[]) => Promise<void>;
}

export function useAdmin(): UseAdminReturn {
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchUsers = useCallback(async (roleFilter: Role | "all" = "all") => {
    if (!supabase) return;
    setLoading(true);
    setError(null);
    try {
      let q = supabase
        .from("profiles")
        .select("id, email, full_name, role, status, phone, created_at")
        .order("created_at", { ascending: false });
      if (roleFilter !== "all") q = q.eq("role", roleFilter);
      const { data, error: err } = await q;
      if (err) throw err;
      setUsers((data ?? []).map((p) => ({
        id: p.id,
        email: p.email ?? "",
        fullName: p.full_name ?? "",
        role: p.role as Role,
        status: (p.status ?? "active") as UserStatus,
        phone: p.phone ?? undefined,
        createdAt: p.created_at,
      })));
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Erreur");
    } finally {
      setLoading(false);
    }
  }, []);

  const updateUser = useCallback(async (id: string, data: { fullName?: string; phone?: string; role?: Role; status?: UserStatus }) => {
    if (!supabase) throw new Error("Supabase non disponible");
    const update: Record<string, unknown> = {};
    if (data.fullName !== undefined) update.full_name = data.fullName;
    if (data.phone !== undefined) update.phone = data.phone || null;
    if (data.role !== undefined) update.role = data.role;
    if (data.status !== undefined) update.status = data.status;
    const { error: err } = await supabase.from("profiles").update(update).eq("id", id);
    if (err) throw new Error(err.message);
    setUsers((prev) => prev.map((u) => u.id === id ? {
      ...u,
      fullName: data.fullName ?? u.fullName,
      phone: data.phone ?? u.phone,
      role: data.role ?? u.role,
      status: data.status ?? u.status,
    } : u));
  }, []);

  const fetchStudents = useCallback(async (): Promise<StudentOption[]> => {
    if (!supabase) return [];
    const { data } = await supabase
      .from("students")
      .select("id, first_name, last_name, classes(name)")
      .order("last_name");
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return (data ?? []).map((s: any) => ({
      id: s.id,
      firstName: s.first_name,
      lastName: s.last_name,
      className: s.classes?.name,
    }));
  }, []);

  const getParentChildren = useCallback(async (parentId: string): Promise<string[]> => {
    if (!supabase) return [];
    const { data } = await supabase
      .from("parent_student")
      .select("student_id")
      .eq("parent_id", parentId);
    return (data ?? []).map((r) => r.student_id);
  }, []);

  const setParentChildren = useCallback(async (parentId: string, studentIds: string[]) => {
    if (!supabase) throw new Error("Supabase non disponible");
    // Delete existing links, then insert new ones
    const { error: delErr } = await supabase
      .from("parent_student")
      .delete()
      .eq("parent_id", parentId);
    if (delErr) throw new Error(delErr.message);

    if (studentIds.length > 0) {
      const rows = studentIds.map((sid) => ({ parent_id: parentId, student_id: sid }));
      const { error: insErr } = await supabase.from("parent_student").insert(rows);
      if (insErr) throw new Error(insErr.message);
    }
  }, []);

  return { users, loading, error, fetchUsers, updateUser, fetchStudents, getParentChildren, setParentChildren };
}
