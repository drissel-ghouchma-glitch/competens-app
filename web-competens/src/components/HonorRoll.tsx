import { useState, useMemo } from "react";
import { useHonorRoll } from "@/hooks/use-honor-roll";
import { useI18n } from "@/i18n";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Star, Search, Trophy, UserCog, Loader2 } from "lucide-react";

export function HonorRoll() {
  const { t } = useI18n();
  const { classes, honorRoll, classStats, teacherStats, loading, error } = useHonorRoll();
  const [classFilter, setClassFilter] = useState("all");
  const [search, setSearch] = useState("");

  const filteredHonorRoll = useMemo(() => {
    let list = honorRoll;
    if (classFilter !== "all") list = list.filter((s) => s.classId === classFilter);
    if (search.trim()) {
      const q = search.trim().toLowerCase();
      list = list.filter((s) => `${s.firstName} ${s.lastName}`.toLowerCase().includes(q));
    }
    return list;
  }, [honorRoll, classFilter, search]);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (error) {
    return <div className="p-3 rounded-lg bg-destructive/10 text-destructive text-sm">{error}</div>;
  }

  return (
    <div className="space-y-6">
      {/* Filters */}
      <div className="flex flex-col sm:flex-row gap-3">
        <div className="relative flex-1">
          <Search className="absolute start-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input
            placeholder={t("honorRoll.searchPlaceholder")}
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="ps-9"
          />
        </div>
        <Select value={classFilter} onValueChange={setClassFilter}>
          <SelectTrigger className="w-full sm:w-56">
            <SelectValue placeholder={t("honorRoll.allClasses")} />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">{t("honorRoll.allClasses")}</SelectItem>
            {classes.map((c) => (
              <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div className="grid lg:grid-cols-3 gap-4 md:gap-6">
        {/* Honor roll list */}
        <Card className="lg:col-span-2 border-amber-500/20 bg-gradient-to-br from-amber-500/5 to-transparent">
          <CardHeader className="pb-2">
            <CardTitle className="text-base font-semibold flex items-center gap-2">
              <Star className="w-4 h-4 text-amber-500 fill-amber-500" />
              {t("honorRoll.title")}
              <Badge variant="secondary" className="ms-1">{filteredHonorRoll.length}</Badge>
            </CardTitle>
          </CardHeader>
          <CardContent>
            {filteredHonorRoll.length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-8">{t("honorRoll.empty")}</p>
            ) : (
              <div className="grid sm:grid-cols-2 gap-3">
                {filteredHonorRoll.map((s) => (
                  <div key={s.id} className="flex items-center gap-3 p-3 rounded-xl bg-card border border-amber-500/20">
                    <div className="w-10 h-10 rounded-full bg-amber-500/15 flex items-center justify-center shrink-0">
                      <Star className="w-5 h-5 text-amber-500 fill-amber-500" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-semibold truncate">{s.firstName} {s.lastName}</p>
                      <p className="text-xs text-muted-foreground truncate">{s.className}</p>
                    </div>
                    <Badge className="bg-amber-500/10 text-amber-700 border-amber-500/20 shrink-0">
                      {s.average}/100
                    </Badge>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Top performing classes (proportional ranking) */}
        <Card className="border-border/50">
          <CardHeader className="pb-2">
            <CardTitle className="text-base font-semibold flex items-center gap-2">
              <Trophy className="w-4 h-4 text-primary" /> {t("honorRoll.topClasses")}
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {classStats.length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-4">{t("honorRoll.noData")}</p>
            ) : (
              classStats.slice(0, 8).map((c, i) => (
                <div key={c.classId} className="flex items-center justify-between gap-2 p-2.5 rounded-lg bg-muted/40">
                  <div className="flex items-center gap-2 min-w-0">
                    <span className="w-5 h-5 rounded-full bg-primary/10 text-primary text-xs font-bold flex items-center justify-center shrink-0">
                      {i + 1}
                    </span>
                    <span className="text-sm font-medium truncate">{c.className}</span>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <span className="text-xs text-muted-foreground font-mono">{c.honoredCount}/{c.totalStudents}</span>
                    <Badge variant="secondary" className="font-mono">{c.rate}%</Badge>
                  </div>
                </div>
              ))
            )}
          </CardContent>
        </Card>
      </div>

      {/* Teacher engagement */}
      <Card className="border-border/50">
        <CardHeader className="pb-2">
          <CardTitle className="text-base font-semibold flex items-center gap-2">
            <UserCog className="w-4 h-4 text-primary" /> {t("honorRoll.activeTeachers")}
          </CardTitle>
        </CardHeader>
        <CardContent>
          {teacherStats.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-4">{t("honorRoll.noData")}</p>
          ) : (
            <div className="divide-y divide-border/50">
              {teacherStats.slice(0, 10).map((tstat, i) => (
                <div key={tstat.teacherId} className="flex items-center justify-between gap-2 py-2.5">
                  <div className="flex items-center gap-2 min-w-0">
                    <span className="w-5 h-5 rounded-full bg-violet-500/10 text-violet-600 text-xs font-bold flex items-center justify-center shrink-0">
                      {i + 1}
                    </span>
                    <span className="text-sm font-medium truncate">{tstat.teacherName}</span>
                  </div>
                  <Badge variant="secondary" className="font-mono shrink-0">
                    {t("honorRoll.evalCount", { count: tstat.count })}
                  </Badge>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
