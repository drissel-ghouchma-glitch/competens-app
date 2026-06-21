import { NavLink, Outlet, useLocation, useNavigate } from "react-router-dom";
import { useState, useEffect } from "react";
import { useAppStore } from "@/stores/app-store";
import { useAuth } from "@/hooks/use-auth";
import { useDemoStore } from "@/stores/demo";
import { useRequests } from "@/hooks/use-requests";
import { cn } from "@/lib/utils";
import {
  LayoutDashboard, GraduationCap, Building2, Users, UserCog,
  BookOpen, ClipboardCheck, Bell, Moon, Sun, Menu, X,
  LogOut, School, UserCheck, ClipboardList,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Badge } from "@/components/ui/badge";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";

const navItems = [
  { to: "/dashboard", icon: LayoutDashboard, label: "Dashboard", roles: ["admin", "directeur", "professeur"] },
  { to: "/school-years", icon: School, label: "Années scolaires", roles: ["admin"] },
  { to: "/levels", icon: GraduationCap, label: "Niveaux", roles: ["admin"] },
  { to: "/classes", icon: Building2, label: "Classes", roles: ["admin", "directeur", "professeur"] },
  { to: "/students", icon: Users, label: "Élèves", roles: ["admin", "directeur", "professeur"] },
  { to: "/teachers", icon: UserCog, label: "Professeurs", roles: ["admin", "directeur"] },
  { to: "/competencies", icon: BookOpen, label: "Compétences", roles: ["admin", "professeur"] },
  { to: "/evaluation", icon: ClipboardCheck, label: "Évaluation", roles: ["professeur"] },
  { to: "/alerts", icon: Bell, label: "Alertes", roles: ["admin", "directeur", "professeur"] },
  { to: "/admin/pending-teachers", icon: UserCheck, label: "Inscriptions", roles: ["admin"] },
  { to: "/admin/requests", icon: ClipboardList, label: "Demandes", roles: ["admin"], badge: true },
];

const mobileNavItems = [
  { to: "/dashboard", icon: LayoutDashboard, label: "Accueil" },
  { to: "/classes", icon: Building2, label: "Classes" },
  { to: "/students", icon: Users, label: "Élèves" },
  { to: "/evaluation", icon: ClipboardCheck, label: "Évaluer" },
  { to: "/alerts", icon: Bell, label: "Alertes" },
];

export default function AppLayout() {
  const location = useLocation();
  const navigate = useNavigate();
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [dark, setDark] = useState(() => {
    if (typeof window !== "undefined") {
      return localStorage.getItem("competens-theme") === "dark" ||
        (!localStorage.getItem("competens-theme") && window.matchMedia("(prefers-color-scheme: dark)").matches);
    }
    return false;
  });

  const initDemo = useAppStore((s) => s.initDemoData);
  const initialized = useAppStore((s) => s.initialized);
  const unreadCount = useAppStore((s) => s.notifications.filter((n) => !n.read).length);
  const { user, isLoading: authLoading, logout } = useAuth();
  const isDemo = useDemoStore((s) => s.isDemoMode);
  const disableDemo = useDemoStore((s) => s.disableDemo);
  const role = user?.role ?? "admin";
  const { pendingCount } = useRequests();

  const handleLogout = async () => {
    await logout();
    disableDemo();
    navigate("/login", { replace: true });
  };

  useEffect(() => {
    // Only seed demo data in demo mode — never pollute the real store
    if (isDemo) initDemo();
  }, [isDemo, initDemo]);

  useEffect(() => {
    if (!authLoading && !user && !isDemo) {
      navigate("/login", { replace: true });
    }
  }, [authLoading, user, isDemo, navigate]);

  useEffect(() => {
    const root = document.documentElement;
    if (dark) {
      root.classList.add("dark");
      localStorage.setItem("competens-theme", "dark");
    } else {
      root.classList.remove("dark");
      localStorage.setItem("competens-theme", "light");
    }
  }, [dark]);

  // In real mode, we don't need the store to be initialized — skip that check
  if (authLoading || (isDemo && !initialized)) {
    return (
      <div className="flex h-screen items-center justify-center bg-background">
        <div className="flex flex-col items-center gap-4">
          <div className="w-12 h-12 rounded-2xl bg-primary flex items-center justify-center animate-pulse">
            <GraduationCap className="w-6 h-6 text-primary-foreground" />
          </div>
          <p className="text-sm text-muted-foreground animate-pulse">Chargement...</p>
        </div>
      </div>
    );
  }

  const filteredNav = navItems.filter((item) => item.roles.includes(role));

  return (
    <div className="flex h-screen overflow-hidden bg-background">
      {/* Desktop Sidebar */}
      <aside className={cn(
        "hidden md:flex flex-col w-64 border-r border-border bg-card shrink-0 transition-all duration-300",
        !initialized && "opacity-0"
      )}>
        <div className="flex items-center gap-3 px-5 h-16 border-b border-border">
          <div className="w-9 h-9 rounded-xl bg-primary flex items-center justify-center">
            <GraduationCap className="w-5 h-5 text-primary-foreground" />
          </div>
          <div>
            <h1 className="font-bold text-foreground text-sm tracking-tight">Compétens</h1>
            <p className="text-xs text-muted-foreground">Suivi scolaire</p>
          </div>
        </div>
        <ScrollArea className="flex-1 px-3 py-4">
          <div className="space-y-1">
            {filteredNav.map((item) => (
              <NavLink
                key={item.to}
                to={item.to}
                onClick={() => setSidebarOpen(false)}
                className={({ isActive }) => cn(
                  "flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium transition-all duration-200",
                  isActive
                    ? "bg-primary/10 text-primary"
                    : "text-muted-foreground hover:text-foreground hover:bg-accent/50"
                )}
              >
                <item.icon className="w-5 h-5 shrink-0" />
                <span className="truncate flex-1">{item.label}</span>
                {"badge" in item && item.badge && !isDemo && pendingCount > 0 && (
                  <span className="ml-auto w-5 h-5 rounded-full bg-destructive flex items-center justify-center text-[10px] font-bold text-destructive-foreground shrink-0">
                    {pendingCount > 9 ? "9+" : pendingCount}
                  </span>
                )}
              </NavLink>
            ))}
          </div>
        </ScrollArea>
        <div className="p-4 border-t border-border space-y-2">
          <div className="flex items-center gap-3 px-2">
            <div className="w-8 h-8 rounded-full bg-primary/20 flex items-center justify-center">
              <span className="text-xs font-bold text-primary">
                {user?.fullName?.charAt(0) ?? "U"}
              </span>
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium text-foreground truncate">{user?.fullName ?? "Utilisateur"}</p>
              <p className="text-xs text-muted-foreground capitalize">{role}</p>
            </div>
          </div>
          <div className="flex gap-1">
            <Tooltip>
              <TooltipTrigger asChild>
                <Button variant="ghost" size="icon" className="flex-1 h-9" onClick={() => setDark(!dark)}>
                  {dark ? <Sun className="w-4 h-4" /> : <Moon className="w-4 h-4" />}
                </Button>
              </TooltipTrigger>
              <TooltipContent>{dark ? "Mode clair" : "Mode sombre"}</TooltipContent>
            </Tooltip>
            <Tooltip>
              <TooltipTrigger asChild>
                <Button variant="ghost" size="icon" className="flex-1 h-9" onClick={handleLogout}>
                  <LogOut className="w-4 h-4" />
                </Button>
              </TooltipTrigger>
              <TooltipContent>Déconnexion</TooltipContent>
            </Tooltip>
          </div>
        </div>
      </aside>

      {/* Mobile Header */}
      <div className="md:hidden fixed top-0 left-0 right-0 z-40 h-14 bg-card/90 backdrop-blur-xl border-b border-border flex items-center px-4 gap-3">
        <Button variant="ghost" size="icon" className="shrink-0" onClick={() => setSidebarOpen(true)}>
          <Menu className="w-5 h-5" />
        </Button>
        <div className="flex items-center gap-2">
          <div className="w-7 h-7 rounded-lg bg-primary flex items-center justify-center">
            <GraduationCap className="w-4 h-4 text-primary-foreground" />
          </div>
          <h1 className="font-bold text-foreground text-sm">Compétens</h1>
        </div>
        <div className="flex-1" />
        <Button variant="ghost" size="icon" className="shrink-0" onClick={() => setDark(!dark)}>
          {dark ? <Sun className="w-4 h-4" /> : <Moon className="w-4 h-4" />}
        </Button>
      </div>

      {/* Mobile Sidebar Overlay */}
      {sidebarOpen && (
        <div className="fixed inset-0 z-50 md:hidden" onClick={() => setSidebarOpen(false)}>
          <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" />
          <div
            className="absolute top-0 left-0 bottom-0 w-72 bg-card shadow-2xl animate-in slide-in-from-left duration-300"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between px-4 h-14 border-b border-border">
              <div className="flex items-center gap-2">
                <GraduationCap className="w-5 h-5 text-primary" />
                <span className="font-bold text-foreground text-sm">Compétens</span>
              </div>
              <Button variant="ghost" size="icon" onClick={() => setSidebarOpen(false)}>
                <X className="w-5 h-5" />
              </Button>
            </div>
            <ScrollArea className="flex-1 px-3 py-4" style={{ height: "calc(100% - 3.5rem)" }}>
              <div className="space-y-1">
                {filteredNav.map((item) => (
                  <NavLink
                    key={item.to}
                    to={item.to}
                    onClick={() => setSidebarOpen(false)}
                    className={({ isActive }) => cn(
                      "flex items-center gap-3 px-3 py-3 rounded-xl text-sm font-medium transition-all",
                      isActive ? "bg-primary/10 text-primary" : "text-muted-foreground"
                    )}
                  >
                    <item.icon className="w-5 h-5" />
                    <span className="flex-1">{item.label}</span>
                    {"badge" in item && item.badge && !isDemo && pendingCount > 0 && (
                      <span className="w-5 h-5 rounded-full bg-destructive flex items-center justify-center text-[10px] font-bold text-destructive-foreground shrink-0">
                        {pendingCount > 9 ? "9+" : pendingCount}
                      </span>
                    )}
                  </NavLink>
                ))}
              </div>
              <div className="mt-4 pt-4 border-t border-border">
                <Button variant="ghost" className="w-full justify-start text-muted-foreground" onClick={handleLogout}>
                  <LogOut className="w-4 h-4 mr-3" /> Déconnexion
                </Button>
              </div>
            </ScrollArea>
          </div>
        </div>
      )}

      {/* Main Content */}
      <main className="flex-1 flex flex-col overflow-hidden">
        <div className="flex-1 overflow-auto pt-14 md:pt-0">
          <div className="mx-auto max-w-7xl p-4 md:p-6 lg:p-8">
            <Outlet />
          </div>
        </div>
      </main>

      {/* Mobile Bottom Nav */}
      <nav className="md:hidden fixed bottom-0 left-0 right-0 z-40 bg-card/90 backdrop-blur-xl border-t border-border">
        <div className="flex items-center justify-around h-16 px-2">
          {mobileNavItems.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              className={({ isActive }) => cn(
                "flex flex-col items-center justify-center gap-0.5 min-w-0 flex-1 py-1 rounded-xl transition-all",
                isActive ? "text-primary" : "text-muted-foreground"
              )}
            >
              <div className="relative">
                <item.icon className="w-5 h-5" />
                {item.label === "Alertes" && unreadCount > 0 && (
                  <span className="absolute -top-1 -right-2 w-4 h-4 rounded-full bg-destructive flex items-center justify-center text-[10px] font-bold text-destructive-foreground">
                    {unreadCount > 9 ? "9+" : unreadCount}
                  </span>
                )}
              </div>
              <span className="text-[10px] font-medium">{item.label}</span>
            </NavLink>
          ))}
        </div>
      </nav>
    </div>
  );
}
