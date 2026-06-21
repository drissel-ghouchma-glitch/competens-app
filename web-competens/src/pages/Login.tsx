import { useState, useEffect } from "react";
import { useNavigate, Link } from "react-router-dom";
import { useAuth } from "@/hooks/use-auth";
import { useDemoStore } from "@/stores/demo";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { GraduationCap, LogIn, AlertCircle } from "lucide-react";
import type { Role } from "@/types";

/** Map each role to its home route after login. */
function homeRouteForRole(role: Role): string {
  switch (role) {
    case "admin":     return "/admin/pending-teachers";
    case "directeur": return "/dashboard";
    case "professeur":
    default:          return "/evaluation";
  }
}

export default function LoginPage() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [isLoading, setIsLoading] = useState(false);

  const { login, user, isLoading: authLoading } = useAuth();
  const { enableDemo, disableDemo } = useDemoStore();
  const navigate = useNavigate();

  // Already authenticated — redirect in effect, never during render
  useEffect(() => {
    if (!authLoading && user) {
      navigate(homeRouteForRole(user.role), { replace: true });
    }
  }, [user, authLoading, navigate]);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setIsLoading(true);

    try {
      disableDemo();                      // make sure demo mode is OFF
      const role = await login(email, password);
      navigate(homeRouteForRole(role), { replace: true });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erreur de connexion.");
    } finally {
      setIsLoading(false);
    }
  };

  const handleDemoLogin = () => {
    setIsLoading(true);
    enableDemo();                         // explicitly enable demo mode
    setTimeout(() => {
      navigate("/dashboard", { replace: true });
    }, 400);
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-primary/5 via-background to-primary/10 p-4">
      <div className="w-full max-w-md">
        {/* Logo */}
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-primary shadow-lg shadow-primary/25 mb-4">
            <GraduationCap className="w-8 h-8 text-primary-foreground" />
          </div>
          <h1 className="text-2xl font-bold text-foreground tracking-tight">Compétens</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Gestion des compétences et évaluations
          </p>
        </div>

        <Card className="shadow-xl border-border/50">
          <CardHeader className="pb-4">
            <CardTitle className="text-lg flex items-center gap-2">
              <LogIn className="w-5 h-5 text-primary" />
              Connexion
            </CardTitle>
            <CardDescription>
              Connectez-vous pour accéder à votre espace
            </CardDescription>
          </CardHeader>
          <CardContent>
            {error && (
              <div className="flex items-center gap-2 p-3 mb-4 rounded-lg bg-destructive/10 text-destructive text-sm border border-destructive/20">
                <AlertCircle className="w-4 h-4 shrink-0" />
                <span>{error}</span>
              </div>
            )}

            <form onSubmit={handleLogin} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="email">Email</Label>
                <Input
                  id="email"
                  type="email"
                  placeholder="votre@email.com"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                  autoComplete="email"
                  className="h-11"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="password">Mot de passe</Label>
                <Input
                  id="password"
                  type="password"
                  placeholder="••••••••"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                  autoComplete="current-password"
                  className="h-11"
                />
              </div>
              <Button
                type="submit"
                className="w-full h-11 font-semibold"
                disabled={isLoading}
              >
                {isLoading ? "Connexion en cours…" : "Se connecter"}
              </Button>
            </form>

            <div className="relative my-4">
              <div className="absolute inset-0 flex items-center">
                <div className="w-full border-t border-border" />
              </div>
              <div className="relative flex justify-center text-xs">
                <span className="bg-card px-2 text-muted-foreground">OU</span>
              </div>
            </div>

            <Button
              variant="outline"
              className="w-full h-11 font-semibold border-2"
              onClick={handleDemoLogin}
              disabled={isLoading}
              type="button"
            >
              <GraduationCap className="w-4 h-4 mr-2" />
              Accéder en mode démo
            </Button>
          </CardContent>
        </Card>

        <p className="text-center text-xs text-muted-foreground mt-4">
          Mode démo — données simulées localement. Aucune connexion réelle requise.
        </p>
        <p className="text-center text-sm text-muted-foreground mt-3">
          Vous êtes enseignant ?{" "}
          <Link to="/register" className="text-primary font-medium hover:underline">
            Créer un compte
          </Link>
        </p>
      </div>
    </div>
  );
}
