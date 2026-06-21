import { createContext, useContext, useState, useCallback, useEffect, type ReactNode } from "react";
import { supabase } from "@/lib/supabase";
import type { User, Role, UserStatus } from "@/types";

interface RegisterTeacherInput {
  email: string;
  password: string;
  firstName: string;
  lastName: string;
  phone?: string;
}

type RegisterParentInput = RegisterTeacherInput;

interface AuthContextType {
  user: User | null;
  isLoading: boolean;
  /** Returns the role of the logged-in user so callers can route accordingly. */
  login: (email: string, password: string) => Promise<Role>;
  register: (email: string, password: string, fullName: string, role: Role) => Promise<void>;
  registerTeacher: (input: RegisterTeacherInput) => Promise<void>;
  registerParent: (input: RegisterParentInput) => Promise<void>;
  /** Admin: update any user's role or status */
  adminUpdateProfile: (userId: string, data: { role?: Role; status?: UserStatus; fullName?: string; phone?: string }) => Promise<void>;
  logout: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    if (!supabase) {
      setIsLoading(false);
      return;
    }

    supabase.auth.getSession().then(({ data: { session } }) => {
      if (session?.user) {
        fetchProfile(session.user.id);
      } else {
        setIsLoading(false);
      }
    }).catch(() => {
      setIsLoading(false);
    });

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      if (session?.user) {
        fetchProfile(session.user.id);
      } else {
        setUser(null);
        setIsLoading(false);
      }
    });

    return () => subscription.unsubscribe();
  }, []);

  const fetchProfile = useCallback(async (userId: string): Promise<User | null> => {
    if (!supabase) { setIsLoading(false); return null; }
    try {
      const { data, error } = await supabase
        .from("profiles")
        .select("*")
        .eq("id", userId)
        .single();

      if (error || !data) {
        console.error("[useAuth] fetchProfile error:", error?.message);
        setUser(null);
        return null;
      }

      const profile: User = {
        id: data.id,
        email: data.email ?? "",
        role: data.role as Role,
        status: (data.status ?? "active") as UserStatus,
        fullName: data.full_name ?? "Utilisateur",
        phone: data.phone ?? undefined,
        avatarUrl: data.avatar_url,
        createdAt: data.created_at,
      };
      setUser(profile);
      return profile;
    } catch {
      setUser(null);
      return null;
    } finally {
      setIsLoading(false);
    }
  }, []);

  /**
   * Authenticates with Supabase and returns the user's role.
   * Throws if credentials are wrong, account is pending/suspended,
   * or no profile row exists.
   */
  const login = useCallback(async (email: string, password: string): Promise<Role> => {
    if (!supabase) throw new Error("Service d'authentification indisponible.");

    const { error, data } = await supabase.auth.signInWithPassword({ email, password });
    if (error) throw new Error(error.message);

    if (!data.user) throw new Error("Authentification échouée.");

    // Read the profile to check status and get role
    const { data: profile, error: profileError } = await supabase
      .from("profiles")
      .select("status, role")
      .eq("id", data.user.id)
      .single();

    if (profileError || !profile) {
      await supabase.auth.signOut();
      throw new Error(
        "Profil introuvable. Contactez l'administrateur pour créer votre profil."
      );
    }

    if (profile.status === "pending") {
      await supabase.auth.signOut();
      throw new Error("Votre compte est en attente de validation par l'administrateur.");
    }
    if (profile.status === "suspended") {
      await supabase.auth.signOut();
      throw new Error("Votre compte a été suspendu. Contactez l'administrateur.");
    }

    // Fetch full profile and update state
    await fetchProfile(data.user.id);
    return profile.role as Role;
  }, [fetchProfile]);

  const register = useCallback(async (email: string, password: string, fullName: string, role: Role) => {
    if (!supabase) throw new Error("Service d'authentification indisponible.");
    const { error, data } = await supabase.auth.signUp({
      email,
      password,
      options: { data: { full_name: fullName, role } },
    });
    if (error) throw new Error(error.message);

    if (data.user) {
      await supabase.from("profiles").insert({
        id: data.user.id,
        email,
        full_name: fullName,
        role,
        status: role === "professeur" ? "pending" : "active",
      });
    }
  }, []);

  const registerTeacher = useCallback(async ({ email, password, firstName, lastName, phone }: RegisterTeacherInput) => {
    if (!supabase) throw new Error("Service d'authentification indisponible.");
    const fullName = `${firstName} ${lastName}`.trim();

    const { error, data } = await supabase.auth.signUp({
      email,
      password,
      options: { data: { full_name: fullName, role: "professeur" } },
    });
    if (error) throw new Error(error.message);

    if (data.user) {
      const { error: profileError } = await supabase.from("profiles").insert({
        id: data.user.id,
        email,
        full_name: fullName,
        role: "professeur",
        phone: phone ?? null,
        status: "pending",
      });
      if (profileError) throw new Error(profileError.message);

      // Sign out immediately — needs admin approval before first real login
      await supabase.auth.signOut();
    }
  }, []);

  const registerParent = useCallback(async ({ email, password, firstName, lastName, phone }: RegisterParentInput) => {
    if (!supabase) throw new Error("Service d'authentification indisponible.");
    const fullName = `${firstName} ${lastName}`.trim();

    const { error, data } = await supabase.auth.signUp({
      email,
      password,
      options: { data: { full_name: fullName, role: "parent" } },
    });
    if (error) throw new Error(error.message);

    if (data.user) {
      const { error: profileError } = await supabase.from("profiles").insert({
        id: data.user.id,
        email,
        full_name: fullName,
        role: "parent",
        phone: phone ?? null,
        status: "pending",
      });
      if (profileError) throw new Error(profileError.message);
      await supabase.auth.signOut();
    }
  }, []);

  const adminUpdateProfile = useCallback(async (userId: string, data: { role?: Role; status?: UserStatus; fullName?: string; phone?: string }) => {
    if (!supabase) throw new Error("Supabase non disponible");
    const update: Record<string, unknown> = {};
    if (data.role !== undefined) update.role = data.role;
    if (data.status !== undefined) update.status = data.status;
    if (data.fullName !== undefined) update.full_name = data.fullName;
    if (data.phone !== undefined) update.phone = data.phone;
    const { error } = await supabase.from("profiles").update(update).eq("id", userId);
    if (error) throw new Error(error.message);
  }, []);

  const logout = useCallback(async () => {
    if (supabase) {
      const { error } = await supabase.auth.signOut();
      if (error) console.error("[useAuth] signOut error:", error.message);
    }
    setUser(null);
  }, []);

  return (
    <AuthContext.Provider value={{ user, isLoading, login, register, registerTeacher, registerParent, adminUpdateProfile, logout }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth(): AuthContextType {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}
