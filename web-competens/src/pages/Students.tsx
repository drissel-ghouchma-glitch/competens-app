import { useState, useMemo, useRef } from "react";
import { Link } from "react-router-dom";
import { useStudents } from "@/hooks/use-students";
import { useRequests } from "@/hooks/use-requests";
import { useAuth } from "@/hooks/use-auth";
import { useDemoStore } from "@/stores/demo";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Search, Upload, UserPlus, Users, ChevronRight, AlertCircle, Loader2, Info, Send } from "lucide-react";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import * as XLSX from "xlsx";
import type { ImportRow } from "@/types";
import { toast } from "sonner";

export default function StudentsPage() {
  const { students, classes, loading, error, addStudent, importStudents } = useStudents();
  const { submitRequest } = useRequests();
  const { user } = useAuth();
  const isDemo = useDemoStore((s) => s.isDemoMode);

  // Teacher in real mode → request flow; admin/directeur or demo → direct insert
  const isTeacherReal = !isDemo && user?.role === "professeur";

  const [search, setSearch] = useState("");
  const [classFilter, setClassFilter] = useState("all");
  const [openAdd, setOpenAdd] = useState(false);
  const [openImport, setOpenImport] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const [importPreview, setImportPreview] = useState<Array<{ firstName: string; lastName: string; birthDate: string; gender: "M" | "F"; classId: string }>>([]);
  const [importError, setImportError] = useState("");
  const [importing, setImporting] = useState(false);

  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [birthDate, setBirthDate] = useState("");
  const [gender, setGender] = useState<"M" | "F">("M");
  const [studentClass, setStudentClass] = useState("");
  const [addLoading, setAddLoading] = useState(false);
  const [addError, setAddError] = useState("");

  const filteredStudents = useMemo(() => {
    let list = students;
    if (search) {
      const q = search.toLowerCase();
      list = list.filter((s) => s.firstName.toLowerCase().includes(q) || s.lastName.toLowerCase().includes(q));
    }
    if (classFilter !== "all") list = list.filter((s) => s.classId === classFilter);
    return list;
  }, [students, search, classFilter]);

  const resetAddForm = () => {
    setFirstName(""); setLastName(""); setBirthDate(""); setGender("M"); setStudentClass("");
    setAddError("");
  };

  const handleAddStudent = async () => {
    if (!firstName || !lastName || !studentClass) return;
    setAddError("");
    setAddLoading(true);
    try {
      if (isTeacherReal) {
        // Send request to admin
        await submitRequest("add_student", { firstName, lastName, birthDate, gender, classId: studentClass });
        toast.success("Demande envoyée à l'administration pour approbation.");
        resetAddForm();
        setOpenAdd(false);
      } else {
        await addStudent({ firstName, lastName, birthDate, gender, classId: studentClass });
        resetAddForm();
        setOpenAdd(false);
      }
    } catch (e: unknown) {
      setAddError(e instanceof Error ? e.message : "Erreur lors de l'opération");
    } finally {
      setAddLoading(false);
    }
  };

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setImportError("");
    const reader = new FileReader();
    reader.onload = (ev) => {
      try {
        const wb = XLSX.read(ev.target?.result, { type: "binary" });
        const ws = wb.Sheets[wb.SheetNames[0]];
        const rows = XLSX.utils.sheet_to_json<ImportRow>(ws);
        const classMap = new Map(classes.map((c) => [c.name.toLowerCase(), c.id]));

        const parseDate = (raw: unknown): string => {
          if (!raw) return "";
          // XLSX sometimes gives a JS serial number for date cells
          if (typeof raw === "number") {
            const d = XLSX.SSF.parse_date_code(raw);
            if (d) return `${d.y}-${String(d.m).padStart(2, "0")}-${String(d.d).padStart(2, "0")}`;
          }
          const str = String(raw).trim();
          // DD/MM/YYYY or DD-MM-YYYY
          const dmyMatch = str.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{4})$/);
          if (dmyMatch) return `${dmyMatch[3]}-${dmyMatch[2].padStart(2, "0")}-${dmyMatch[1].padStart(2, "0")}`;
          // Already YYYY-MM-DD
          if (/^\d{4}-\d{2}-\d{2}$/.test(str)) return str;
          return "";
        };

        const mapped = rows.map((r) => {
          let classId = "";
          const rawClasse = r.Classe?.toString().toLowerCase().trim() ?? "";
          for (const [cName, cId] of classMap) {
            if (rawClasse === cName || rawClasse.includes(cName) || cName.includes(rawClasse)) {
              classId = cId; break;
            }
          }
          return {
            firstName: r["Prénom"]?.toString().trim() ?? "",
            lastName: r["Nom"]?.toString().trim() ?? "",
            birthDate: parseDate(r["Date de naissance"]),
            gender: (r["Sexe"]?.toString().toUpperCase().startsWith("F") ? "F" : "M") as "M" | "F",
            classId,
          };
        }).filter((r) => r.firstName && r.lastName);
        setImportPreview(mapped);
      } catch {
        setImportError("Format invalide. Colonnes : Nom, Prénom, Date de naissance, Sexe, Classe");
      }
    };
    reader.readAsBinaryString(file);
  };

  const handleImport = async () => {
    if (importPreview.length === 0) return;
    setImporting(true);
    setImportError("");
    try {
      const result = await importStudents(importPreview);
      setImportPreview([]);
      setOpenImport(false);
      if (result.failed.length === 0) {
        toast.success(`${result.succeeded} élève(s) importé(s) avec succès.`);
      } else if (result.succeeded === 0) {
        toast.error(`Aucun élève importé. ${result.failed.length} erreur(s).`);
      } else {
        toast.warning(
          `${result.succeeded} importé(s), ${result.failed.length} échoué(s) : ${result.failed.map((f) => f.name).join(", ")}`
        );
      }
    } catch (e: unknown) {
      setImportError(e instanceof Error ? e.message : "Erreur lors de l'importation");
    } finally {
      setImporting(false);
    }
  };

  const addButtonLabel = isTeacherReal ? "Demander l'ajout d'un élève" : "Ajouter un élève";
  const dialogTitle = isTeacherReal ? "Demande d'ajout d'élève" : "Ajouter un élève";
  const dialogDesc = isTeacherReal
    ? "Cette demande sera envoyée à l'administration pour approbation."
    : "Renseignez les informations de l'élève";

  return (
    <div className="space-y-6 animate-in fade-in duration-500">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Élèves</h1>
          <p className="text-sm text-muted-foreground">
            {loading ? "Chargement…" : `${students.length} élève${students.length !== 1 ? "s" : ""} inscrits`}
          </p>
        </div>
        <div className="flex gap-2">
          {/* Import Excel — admin/directeur only */}
          {!isTeacherReal && (
            <Dialog open={openImport} onOpenChange={setOpenImport}>
              <DialogTrigger asChild>
                <Button variant="outline" size="sm" className="gap-2">
                  <Upload className="w-4 h-4" /> Importer Excel
                </Button>
              </DialogTrigger>
              <DialogContent className="max-w-lg">
                <DialogHeader>
                  <DialogTitle>Importer des élèves</DialogTitle>
                  <DialogDescription>
                    Fichier Excel (.xlsx) — colonnes : Nom, Prénom, Date de naissance, Sexe, Classe
                  </DialogDescription>
                </DialogHeader>
                <div className="space-y-4 pt-2">
                  <div className="border-2 border-dashed border-border rounded-xl p-6 text-center">
                    <Upload className="w-8 h-8 text-muted-foreground mx-auto mb-3" />
                    <input ref={fileRef} type="file" accept=".xlsx,.xls" onChange={handleFileUpload} className="hidden" />
                    <Button variant="outline" onClick={() => fileRef.current?.click()} className="mb-2">
                      Choisir un fichier
                    </Button>
                    <p className="text-xs text-muted-foreground">.xlsx uniquement</p>
                  </div>
                  {importError && (
                    <div className="flex items-center gap-2 p-3 rounded-lg bg-destructive/10 text-destructive text-sm">
                      <AlertCircle className="w-4 h-4 shrink-0" /> {importError}
                    </div>
                  )}
                  {importPreview.length > 0 && (
                    <div>
                      <p className="text-sm font-medium mb-2">{importPreview.length} élèves détectés</p>
                      <div className="max-h-40 overflow-auto border rounded-lg">
                        {importPreview.slice(0, 5).map((s, i) => (
                          <div key={i} className="px-3 py-2 text-sm border-b last:border-0 flex justify-between">
                            <span>{s.firstName} {s.lastName}</span>
                            <Badge variant="secondary">{classes.find((c) => c.id === s.classId)?.name ?? "?"}</Badge>
                          </div>
                        ))}
                        {importPreview.length > 5 && (
                          <p className="px-3 py-2 text-xs text-muted-foreground">… et {importPreview.length - 5} autres</p>
                        )}
                      </div>
                    </div>
                  )}
                  <Button onClick={handleImport} className="w-full" disabled={importPreview.length === 0 || importing}>
                    {importing ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : null}
                    Importer {importPreview.length} élèves
                  </Button>
                </div>
              </DialogContent>
            </Dialog>
          )}

          {/* Add / Request student */}
          <Dialog open={openAdd} onOpenChange={(o) => { setOpenAdd(o); if (!o) resetAddForm(); }}>
            <DialogTrigger asChild>
              <Button size="sm" className="gap-2">
                {isTeacherReal ? <Send className="w-4 h-4" /> : <UserPlus className="w-4 h-4" />}
                {addButtonLabel}
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>{dialogTitle}</DialogTitle>
                <DialogDescription>{dialogDesc}</DialogDescription>
              </DialogHeader>
              <div className="space-y-4 pt-2">
                {isTeacherReal && (
                  <div className="flex items-start gap-2 p-3 rounded-lg bg-primary/5 border border-primary/20 text-sm text-primary">
                    <Info className="w-4 h-4 shrink-0 mt-0.5" />
                    La demande sera examinée par l'administration avant d'être ajoutée.
                  </div>
                )}
                {addError && (
                  <div className="flex items-center gap-2 p-3 rounded-lg bg-destructive/10 text-destructive text-sm">
                    <AlertCircle className="w-4 h-4 shrink-0" /> {addError}
                  </div>
                )}
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-2">
                    <Label>Prénom</Label>
                    <Input value={firstName} onChange={(e) => setFirstName(e.target.value)} placeholder="Fatou" />
                  </div>
                  <div className="space-y-2">
                    <Label>Nom</Label>
                    <Input value={lastName} onChange={(e) => setLastName(e.target.value)} placeholder="Ndiaye" />
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-2">
                    <Label>Date de naissance</Label>
                    <Input type="date" value={birthDate} onChange={(e) => setBirthDate(e.target.value)} />
                  </div>
                  <div className="space-y-2">
                    <Label>Sexe</Label>
                    <Select value={gender} onValueChange={(v) => setGender(v as "M" | "F")}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="M">Masculin</SelectItem>
                        <SelectItem value="F">Féminin</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>
                <div className="space-y-2">
                  <Label>Classe</Label>
                  <Select value={studentClass} onValueChange={setStudentClass}>
                    <SelectTrigger><SelectValue placeholder="Sélectionner une classe" /></SelectTrigger>
                    <SelectContent>
                      {classes.filter((c) => !c.isArchived).map((c) => (
                        <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  {classes.length === 0 && (
                    <p className="text-xs text-muted-foreground flex items-center gap-1">
                      <Info className="w-3 h-3" /> Aucune classe disponible
                    </p>
                  )}
                </div>
                <Button onClick={handleAddStudent} className="w-full" disabled={addLoading || !firstName || !lastName || !studentClass}>
                  {addLoading ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : null}
                  {isTeacherReal ? "Envoyer la demande" : "Ajouter"}
                </Button>
              </div>
            </DialogContent>
          </Dialog>
        </div>
      </div>

      {error && (
        <div className="flex items-center gap-2 p-3 rounded-lg bg-destructive/10 text-destructive text-sm">
          <AlertCircle className="w-4 h-4 shrink-0" /> {error}
        </div>
      )}

      {/* Filters */}
      <div className="flex flex-col sm:flex-row gap-3">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input placeholder="Rechercher un élève..." value={search} onChange={(e) => setSearch(e.target.value)} className="pl-9" />
        </div>
        <Select value={classFilter} onValueChange={setClassFilter}>
          <SelectTrigger className="w-[180px]"><SelectValue placeholder="Toutes les classes" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Toutes les classes</SelectItem>
            {classes.map((c) => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}
          </SelectContent>
        </Select>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-16">
          <Loader2 className="w-8 h-8 animate-spin text-muted-foreground" />
        </div>
      ) : (
        <>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
            {filteredStudents.map((s) => {
              const cls = classes.find((c) => c.id === s.classId);
              return (
                <Link key={s.id} to={`/students/${s.id}`}>
                  <Card className="border-border/50 hover:shadow-lg hover:-translate-y-0.5 transition-all cursor-pointer group h-full">
                    <CardContent className="p-4">
                      <div className="flex items-center gap-3">
                        <div className="w-11 h-11 rounded-xl bg-primary/10 flex items-center justify-center text-primary font-bold text-sm shrink-0">
                          {s.firstName[0]}{s.lastName[0]}
                        </div>
                        <div className="flex-1 min-w-0">
                          <h3 className="font-semibold text-foreground truncate">{s.firstName} {s.lastName}</h3>
                          <p className="text-xs text-muted-foreground">{cls?.name ?? "—"}</p>
                        </div>
                        <ChevronRight className="w-4 h-4 text-muted-foreground opacity-0 group-hover:opacity-100 shrink-0" />
                      </div>
                    </CardContent>
                  </Card>
                </Link>
              );
            })}
          </div>
          {filteredStudents.length === 0 && (
            <Card className="border-dashed border-2">
              <CardContent className="p-8 text-center">
                <Users className="w-10 h-10 text-muted-foreground mx-auto mb-3" />
                <p className="text-muted-foreground font-medium">Aucun élève</p>
                <p className="text-sm text-muted-foreground mt-1">
                  {isTeacherReal ? "Envoyez une demande d'ajout à l'administration" : "Ajoutez des élèves ou importez un fichier Excel"}
                </p>
              </CardContent>
            </Card>
          )}
        </>
      )}
    </div>
  );
}
