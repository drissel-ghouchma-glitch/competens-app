import { useState, useMemo } from "react";
import { useHonorRoll } from "@/hooks/use-honor-roll";
import { useCelebrationSettings } from "@/hooks/use-celebration-settings";
import { useI18n } from "@/i18n";
import { cn } from "@/lib/utils";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Star, Search, Trophy, UserCog, Loader2, ChevronDown, Eye, EyeOff } from "lucide-react";

interface HonorRollProps {
  /** Admin/directeur controls: publish toggle + per-teacher penalty breakdown. */
  isAdmin?: boolean;
}

export function HonorRoll({ isAdmin = true }: HonorRollProps) {
  const { t, lang } = useI18n();
  const { classes, honorRoll, classStats, teacherStats, loading, error } = useHonorRoll(lang);
  const { isPublished, error: publishError, setPublished } = useCelebrationSettings();
  const [classFilter, setClassFilter] = useState("all");
  const [search, setSearch] = useState("");
  const [expandedTeacherId, setExpandedTeacherId] = useState<string | null>(null);
  const [publishing, setPublishing] = useState(false);

  const filteredHonorRoll = useMemo(() => {
    let list = honorRoll;
    if (classFilter !== "all") list = list.filter((s) => s.classId === classFilter);
    if (search.trim()) {
      const q = search.trim().toLowerCase();
      list = list.filter((s) => `${s.firstName} ${s.lastName}`.toLowerCase().includes(q));
    }
    return list;
  }, [honorRoll, classFilter, search]);

  const handleTogglePublish = async () => {
    setPublishing(true);
    try {
      await setPublished(!isPublished);
    } finally {
      setPublishing(false);
    }
  };

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
      {/* Admin publish/hide control */}
      {isAdmin && (
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 p-3 rounded-xl border border-border/50 bg-muted/30">
          <div className="flex items-center gap-2 text-sm">
            {isPublished
              ? <Eye className="w-4 h-4 text-green-500 shrink-0" />
              : <EyeOff className="w-4 h-4 text-muted-foreground shrink-0" />}
            <span className="text-muted-foreground">
              {isPublished ? t("honorRoll.publishedStatus") : t("honorRoll.hiddenStatus")}
            </span>
          </div>
          <Button
            size="sm"
            variant={isPublished ? "outline" : "default"}
            onClick={handleTogglePublish}
            disabled={publishing}
            className="gap-1.5 shrink-0"
          >
            {publishing
              ? <Loader2 className="w-3.5 h-3.5 animate-spin" />
              : isPublished ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
            {isPublished ? t("honorRoll.hideAction") : t("honorRoll.publishAction")}
          </Button>
        </div>
      )}
      {isAdmin && publishError && (
        <div className="p-3 rounded-lg bg-destructive/10 text-destructive text-sm">{publishError}</div>
      )}

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

      {/* Teacher engagement — admin-only drill-down */}
      {isAdmin && (
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
                {teacherStats.slice(0, 10).map((tstat, i) => {
                  const expanded = expandedTeacherId === tstat.teacherId;
                  return (
                    <div key={tstat.teacherId}>
                      <button
                        type="button"
                        onClick={() => setExpandedTeacherId(expanded ? null : tstat.teacherId)}
                        className="flex items-center justify-between gap-2 py-2.5 w-full text-start rounded-lg px-1.5 -mx-1.5 hover:bg-muted/40 transition-colors"
                      >
                        <div className="flex items-center gap-2 min-w-0">
                          <span className="w-5 h-5 rounded-full bg-violet-500/10 text-violet-600 text-xs font-bold flex items-center justify-center shrink-0">
                            {i + 1}
                          </span>
                          <span className="text-sm font-medium truncate">{tstat.teacherName}</span>
                        </div>
                        <div className="flex items-center gap-2 shrink-0">
                          <Badge variant="secondary" className="font-mono">
                            {t("honorRoll.evalCount", { count: tstat.count })}
                          </Badge>
                          <ChevronDown className={cn("w-3.5 h-3.5 text-muted-foreground transition-transform", expanded && "rotate-180")} />
                        </div>
                      </button>
                      {expanded && (
                        <div className="pb-3 ps-7 space-y-1.5">
                          {tstat.breakdown.length === 0 ? (
                            <p className="text-xs text-muted-foreground italic">{t("honorRoll.noBreakdown")}</p>
                          ) : (
                            tstat.breakdown.map((b) => (
                              <div key={b.competencyId} className="flex items-center justify-between gap-3 text-xs">
                                <span className="text-muted-foreground truncate">
                                  {b.competencyCode ? `${b.competencyCode} — ${b.competencyTitle}` : b.competencyTitle}
                                </span>
                                <Badge variant="outline" className="font-mono shrink-0">
                                  {t("honorRoll.evalCount", { count: b.count })}
                                </Badge>
                              </div>
                            ))
                          )}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  );
}
