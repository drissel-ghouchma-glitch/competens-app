import { Link } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Home, Search, ArrowLeft } from "lucide-react";

export default function NotFound() {
  return (
    <div className="min-h-[60vh] flex items-center justify-center">
      <div className="text-center space-y-4">
        <div className="inline-flex items-center justify-center w-20 h-20 rounded-full bg-muted mb-2">
          <Search className="w-8 h-8 text-muted-foreground" />
        </div>
        <h1 className="text-6xl font-bold text-foreground font-mono">404</h1>
        <p className="text-lg text-muted-foreground">Page introuvable</p>
        <p className="text-sm text-muted-foreground max-w-sm mx-auto">
          La page que vous recherchez n'existe pas ou a été déplacée.
        </p>
        <Link to="/dashboard">
          <Button className="gap-2 mt-2">
            <ArrowLeft className="w-4 h-4" /> Retour au dashboard
          </Button>
        </Link>
      </div>
    </div>
  );
}
