import { Link } from "react-router-dom";
import { useAuth } from "@/hooks/use-auth";
import { useI18n } from "@/i18n";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  AlertTriangle,
  Bell,
  BookOpen,
  Building2,
  CalendarCheck,
  CheckCheck,
  CheckCircle2,
  ChevronRight,
  CircleAlert,
  CircleHelp,
  ClipboardCheck,
  Cloud,
  GraduationCap,
  LayoutDashboard,
  Languages,
  LockKeyhole,
  RefreshCw,
  Search,
  Trophy,
  Users,
  Wifi,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";

type GuideLanguage = "ar" | "fr";

type StepProps = {
  number: number;
  title: string;
  children: React.ReactNode;
};

type FlowItem = {
  icon: LucideIcon;
  label: string;
  tone: string;
};

function Step({ number, title, children }: StepProps) {
  return (
    <div className="relative ps-12">
      <div className="absolute start-0 top-0 flex h-8 w-8 items-center justify-center rounded-full bg-primary text-sm font-bold text-primary-foreground">
        {number}
      </div>
      <h3 className="pt-1 font-semibold text-foreground">{title}</h3>
      <div className="mt-1 text-sm leading-6 text-muted-foreground">{children}</div>
    </div>
  );
}

function Flow({ items }: { items: FlowItem[] }) {
  return (
    <div className="mt-5 grid gap-2 sm:grid-cols-4">
      {items.map((item, index) => (
        <div key={item.label} className="flex items-center gap-2 sm:block">
          <div className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl ${item.tone}`}>
            <item.icon className="h-5 w-5" />
          </div>
          <div className="min-w-0 sm:mt-2">
            <p className="text-sm font-medium text-foreground">{item.label}</p>
            {index < items.length - 1 && <ChevronRight className="mt-2 hidden h-4 w-4 text-muted-foreground sm:block rtl:rotate-180" />}
          </div>
        </div>
      ))}
    </div>
  );
}

function GuideLink({ to, icon: Icon, label, description }: { to: string; icon: LucideIcon; label: string; description: string }) {
  return (
    <Link to={to} className="group block">
      <Card className="h-full border-border/60 transition-all hover:-translate-y-0.5 hover:border-primary/40 hover:shadow-md">
        <CardContent className="flex h-full gap-3 p-4">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary">
            <Icon className="h-5 w-5" />
          </div>
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-1">
              <p className="font-semibold text-foreground">{label}</p>
              <ChevronRight className="h-4 w-4 text-muted-foreground transition-transform group-hover:translate-x-0.5 rtl:rotate-180 rtl:group-hover:-translate-x-0.5" />
            </div>
            <p className="mt-1 text-xs leading-5 text-muted-foreground">{description}</p>
          </div>
        </CardContent>
      </Card>
    </Link>
  );
}

function StatusCard({ icon: Icon, title, description, className }: { icon: LucideIcon; title: string; description: string; className: string }) {
  return (
    <div className={`rounded-xl border p-3 ${className}`}>
      <Icon className="h-4 w-4" />
      <p className="mt-2 text-sm font-semibold">{title}</p>
      <p className="mt-1 text-xs leading-5 opacity-85">{description}</p>
    </div>
  );
}

export default function TeacherGuidePage() {
  const { user } = useAuth();
  const { lang } = useI18n();
  const guideLanguage: GuideLanguage = lang === "ar" ? "ar" : "fr";
  const ar = guideLanguage === "ar";

  if (user?.role && user.role !== "professeur") {
    return (
      <Card className="mx-auto mt-12 max-w-lg border-border/60">
        <CardContent className="p-8 text-center">
          <CircleHelp className="mx-auto h-10 w-10 text-primary" />
          <h1 className="mt-4 text-xl font-bold">{ar ? "دليل الأستاذ" : "Guide enseignant"}</h1>
          <p className="mt-2 text-sm text-muted-foreground">
            {ar ? "هذا الدليل مخصص لحساب الأستاذ." : "Ce guide est réservé au compte professeur."}
          </p>
        </CardContent>
      </Card>
    );
  }

  const copy = ar
    ? {
      title: "دليل الاستعمال",
      subtitle: "دليل سريع وبسيط لاستعمال حساب الأستاذ، خطوة بخطوة.",
      introTitle: "ابدأ من هنا",
      intro: "اتبع هذا الترتيب في يومك الدراسي: قيّم، ثم سجّل الحضور، ثم راجع التنبيهات. كل خطوة محفوظة وآمنة حتى عند انقطاع الإنترنت.",
      startEvaluation: "ابدأ التقييم",
      startAttendance: "سجّل الحضور",
      evaluation: "1. كيف تقوم بالتقييم؟",
      evaluationIntro: "التقييم يسجل ملاحظتك حول الكفاية المختارة. تستعمله فقط مع تلاميذ القسم الذي تدرّسه.",
      evaluationSteps: [
        ["اختر القسم", "اختر أحد أقسامك من أعلى الصفحة."],
        ["اختر الكفاية", "اختر الكفاية التي لاحظتها أثناء النشاط أو الحصة."],
        ["حدّد التلاميذ", "اضغط على التلميذ الذي يحتاج إلى خصم نقطة في هذه الكفاية. اضغط مرة ثانية قبل الحفظ للتراجع."],
        ["احفظ", "راجع القائمة، ثم اضغط حفظ وأكّد العملية."],
      ],
      evaluationLockTitle: "بعد الحفظ",
      evaluationLock: "يُقفل تقييم اليوم لهذه الكفاية؛ لا يمكنك تعديله بعد ذلك. استعمل التقييم بدقة قبل التأكيد.",
      attendance: "2. كيف تسجّل الحضور؟",
      attendanceIntro: "الحضور مفصول حسب القسم والتاريخ والفترة: صباح أو بعد الظهر.",
      attendanceSteps: [
        ["اختر القسم والتاريخ", "حدّد القسم واليوم الصحيحين."],
        ["اختر الفترة", "اضغط صباح أو بعد الظهر. لكل فترة سجل مستقل."],
        ["علّم الغياب", "كل التلاميذ حاضرون افتراضياً. اضغط على صف التلميذ الغائب فقط."],
        ["احفظ السجل", "اضغط حفظ. عند العودة سترى الغائبين كما سجلتهم، لكن لن تستطيع تغييرهم."],
      ],
      attendanceLockTitle: "السجل مقفل",
      attendanceLock: "بعد الحفظ، يُقفل سجل القسم في التاريخ والفترة نفسيهما. قد تؤكد الإدارة الغياب لاحقاً وترسل لك النتيجة في التنبيهات.",
      alerts: "3. أين ترى ما قمت به؟",
      alertsIntro: "صفحة التنبيهات تجمع رسائل الإدارة وسجل نشاطاتك أنت فقط؛ لا تظهر لك نشاطات الأساتذة الآخرين.",
      alertsSteps: [
        ["رسائل الإدارة وطلباتي", "هنا تجد تأكيد أو رفض الغياب، وحالة طلب إضافة قسم أو تلميذ أو كفاية، وأي رسالة تخص تلاميذك."],
        ["سجل النشاط", "اختر تاريخاً، حتى تاريخاً سابقاً، ثم قسماً أو نوع نشاط أو اسم تلميذ لتراجع تقييماتك وحضورك في ذلك اليوم."],
        ["بطاقات التنبيه", "تعطيك ملخصاً للحالات الحرجة والخفيفة والمحسومة. اقرأ وصف كل بطاقة داخل الصفحة."],
      ],
      principal: "4. أقسامك الرئيسية: متابعة التلاميذ الذين يحتاجون دعماً",
      principalIntro: "هذا المكان مخصص للقسم الذي أنت أستاذه الرئيسي. اختر القسم ثم راقب مستوى كل تلميذ حسب ألوان الأحزمة.",
      principalAction: "عند ظهور تلميذ يحتاج إلى دعم: افتح بطاقته، راجع تاريخ الكفايات، اعقد جلسة متابعة، ثم سجّل الرفع أو إعادة الكفاية بطريقة موثقة.",
      resetTitle: "إعادة كفاية إلى 100%",
      reset: "بعد جلسة حقيقية، أدخل تاريخ الجلسة وسبب التلميذ وملاحظاتك. تستطيع إعادة الكفاية نفسها إلى 100% مرتين فقط. في المحاولة الثالثة يُرسل الطلب إلى الإدارة للمراجعة.",
      other: "5. باقي الواجهات والأزرار",
      otherIntro: "هذه الواجهات تساعدك على الوصول للمعلومة أو إرسال طلب للإدارة؛ صلاحيات الإنشاء والتعديل الإداري تبقى للإدارة.",
      offlineTitle: "إذا انقطع الإنترنت",
      offline: "احفظ عملك كالمعتاد. تظهر علامة غير متصل وعدد العمليات المعلقة أسفل القائمة. عند عودة الإنترنت تُرسل تلقائياً، ويمكنك ضغط زر المزامنة إن ظهر.",
      finishTitle: "تذكير سريع",
      finish: "قبل الحفظ راجع القسم والتاريخ والكفاية. بعد الحفظ، افتح التنبيهات لتتأكد من العملية أو من رد الإدارة.",
      links: {
        evaluation: ["التقييم", "اختر كفاية وسجّل ملاحظتك."],
        attendance: ["الحضور", "سجل الغياب حسب الفترة."],
        alerts: ["التنبيهات", "تابع الرسائل وسجل نشاطاتك."],
        principal: ["أقسامي الرئيسية", "تابع التلاميذ الذين يحتاجون دعماً."],
      },
      otherItems: [
        ["الرئيسية", "ملخص الأرقام، نشاط آخر 7 أيام، والتنبيهات الأخيرة.", LayoutDashboard],
        ["الأقسام", "شاهد الأقسام، وابعت طلب الوصول إلى قسم عبر زر طلب قسم.", Building2],
        ["التلاميذ", "ابحث عن تلاميذ أقسامك وافتح بطاقتهم. إضافة تلميذ ترسل كطلب للإدارة.", Users],
        ["الكفايات", "اطلع على الكفايات. زر الإضافة يرسل طلب كفاية جديدة للإدارة.", BookOpen],
        ["تحديث", "يعيد جلب معلومات الصفحة الحالية عندما تحتاج إلى أحدث حالة.", RefreshCw],
        ["اللغة والمظهر والخروج", "في أسفل القائمة: تغيير اللغة، الوضع الليلي أو النهاري، ثم تسجيل الخروج.", Languages],
      ] as [string, string, LucideIcon][],
    }
    : {
      title: "Guide d’utilisation",
      subtitle: "Un guide rapide et simple pour utiliser votre compte professeur.",
      introTitle: "Commencez ici",
      intro: "Pour une journée de classe, suivez cet ordre : évaluez, enregistrez les présences, puis consultez vos alertes. Chaque action reste protégée, même sans Internet.",
      startEvaluation: "Commencer une évaluation",
      startAttendance: "Enregistrer les présences",
      evaluation: "1. Comment évaluer ?",
      evaluationIntro: "L’évaluation enregistre votre observation sur la compétence choisie. Elle concerne uniquement les élèves de vos classes.",
      evaluationSteps: [
        ["Choisissez la classe", "Sélectionnez l’une de vos classes en haut de la page."],
        ["Choisissez la compétence", "Sélectionnez la compétence observée pendant l’activité ou la séance."],
        ["Sélectionnez les élèves", "Cliquez sur l’élève qui doit perdre un point pour cette compétence. Cliquez une deuxième fois avant l’enregistrement pour annuler."],
        ["Enregistrez", "Relisez la liste, puis cliquez sur Enregistrer et confirmez."],
      ],
      evaluationLockTitle: "Après l’enregistrement",
      evaluationLock: "L’évaluation du jour est verrouillée pour cette compétence : elle ne peut plus être modifiée. Vérifiez bien avant de confirmer.",
      attendance: "2. Comment enregistrer les présences ?",
      attendanceIntro: "Les présences sont séparées par classe, date et période : matin ou après-midi.",
      attendanceSteps: [
        ["Choisissez la classe et la date", "Sélectionnez votre classe et le bon jour."],
        ["Choisissez la période", "Cliquez sur Matin ou Après-midi. Chaque période possède son propre registre."],
        ["Marquez les absences", "Tous les élèves sont présents par défaut. Cliquez seulement sur la ligne de l’élève absent."],
        ["Enregistrez le registre", "Cliquez sur Enregistrer. À votre retour, les absents resteront visibles mais ne pourront plus être modifiés."],
      ],
      attendanceLockTitle: "Registre verrouillé",
      attendanceLock: "Après l’enregistrement, le registre de cette classe, date et période est verrouillé. L’administration peut confirmer l’absence et vous transmettre le résultat dans les alertes.",
      alerts: "3. Où retrouver ce que vous avez fait ?",
      alertsIntro: "La page Alertes réunit les messages de l’administration et votre propre journal : les actions des autres professeurs ne sont pas affichées.",
      alertsSteps: [
        ["Messages de l’administration et mes demandes", "Vous y recevez la confirmation ou le refus d’une absence, le suivi d’une demande de classe, d’élève ou de compétence, et les messages concernant vos élèves."],
        ["Journal d’activité", "Choisissez une date, y compris une date passée, puis une classe, un type d’activité ou un élève pour revoir vos évaluations et vos présences du jour."],
        ["Cartes d’alertes", "Elles résument les alertes critiques, légères et résolues. Une courte explication est affichée dans chaque carte."],
      ],
      principal: "4. Mes classes principales : accompagner les élèves en difficulté",
      principalIntro: "Cette page concerne la classe dont vous êtes professeur principal. Choisissez la classe puis suivez chaque élève avec les couleurs de ceinture.",
      principalAction: "Si un élève a besoin d’aide : ouvrez sa fiche, consultez l’historique de ses compétences, menez un entretien, puis enregistrez une progression ou une reprise de compétence documentée.",
      resetTitle: "Remettre une compétence à 100 %",
      reset: "Après un vrai entretien, indiquez la date, la raison de l’élève et vos notes. Vous pouvez remettre la même compétence à 100 % deux fois seulement. À la troisième demande, l’administration doit la valider.",
      other: "5. Les autres pages et boutons",
      otherIntro: "Ces pages servent à consulter les informations ou à envoyer une demande à l’administration. Les créations et modifications administratives restent réservées à l’administration.",
      offlineTitle: "En cas de coupure Internet",
      offline: "Enregistrez normalement. L’indicateur Hors ligne et le nombre d’opérations en attente apparaissent en bas du menu. À la reconnexion, les opérations sont envoyées automatiquement ; utilisez le bouton de synchronisation s’il s’affiche.",
      finishTitle: "Mémo rapide",
      finish: "Avant d’enregistrer, vérifiez la classe, la date et la compétence. Après l’enregistrement, ouvrez les Alertes pour vérifier l’action ou la réponse de l’administration.",
      links: {
        evaluation: ["Évaluation", "Choisissez une compétence et enregistrez votre observation."],
        attendance: ["Présences", "Enregistrez les absences par période."],
        alerts: ["Alertes", "Suivez vos messages et votre journal."],
        principal: ["Mes classes principales", "Accompagnez les élèves qui ont besoin d’aide."],
      },
      otherItems: [
        ["Tableau de bord", "Les chiffres clés, l’activité des 7 derniers jours et les alertes récentes.", LayoutDashboard],
        ["Classes", "Consultez les classes et demandez l’accès à une classe avec le bouton de demande.", Building2],
        ["Élèves", "Recherchez les élèves de vos classes et ouvrez leur fiche. L’ajout d’un élève devient une demande à l’administration.", Users],
        ["Compétences", "Consultez les compétences. Le bouton d’ajout envoie une demande de nouvelle compétence à l’administration.", BookOpen],
        ["Actualiser", "Recharge les informations de la page en cours quand vous avez besoin de la dernière situation.", RefreshCw],
        ["Langue, thème et déconnexion", "En bas du menu : changez la langue, le thème clair/sombre, puis déconnectez-vous.", Languages],
      ] as [string, string, LucideIcon][],
    };

  const evaluationSteps = copy.evaluationSteps as [string, string][];
  const attendanceSteps = copy.attendanceSteps as [string, string][];
  const alertSteps = copy.alertsSteps as [string, string][];

  return (
    <div className="mx-auto max-w-6xl space-y-6 animate-in fade-in duration-500">
      <section className="overflow-hidden rounded-2xl border border-primary/20 bg-gradient-to-br from-primary/10 via-background to-background p-5 md:p-8">
        <Badge className="gap-1.5 bg-primary/15 text-primary hover:bg-primary/15" variant="secondary">
          <CircleHelp className="h-3.5 w-3.5" /> {ar ? "حساب الأستاذ" : "Compte professeur"}
        </Badge>
        <h1 className="mt-3 text-2xl font-bold tracking-tight md:text-3xl">{copy.title}</h1>
        <p className="mt-2 max-w-2xl text-sm leading-6 text-muted-foreground">{copy.subtitle}</p>
        <div className="mt-5 flex flex-wrap gap-2">
          <Button asChild className="gap-2"><Link to="/evaluation"><ClipboardCheck className="h-4 w-4" />{copy.startEvaluation}</Link></Button>
          <Button asChild variant="outline" className="gap-2"><Link to="/attendance"><CalendarCheck className="h-4 w-4" />{copy.startAttendance}</Link></Button>
        </div>
      </section>

      <Card className="border-border/60">
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-lg"><GraduationCap className="h-5 w-5 text-primary" />{copy.introTitle}</CardTitle>
          <CardDescription className="leading-6">{copy.intro}</CardDescription>
        </CardHeader>
        <CardContent className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <GuideLink to="/evaluation" icon={ClipboardCheck} label={copy.links.evaluation[0]} description={copy.links.evaluation[1]} />
          <GuideLink to="/attendance" icon={CalendarCheck} label={copy.links.attendance[0]} description={copy.links.attendance[1]} />
          <GuideLink to="/alerts" icon={Bell} label={copy.links.alerts[0]} description={copy.links.alerts[1]} />
          <GuideLink to="/principal-classes" icon={Trophy} label={copy.links.principal[0]} description={copy.links.principal[1]} />
        </CardContent>
      </Card>

      <Card id="evaluation" className="border-amber-500/25">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-lg"><ClipboardCheck className="h-5 w-5 text-amber-600" />{copy.evaluation}</CardTitle>
          <CardDescription className="leading-6">{copy.evaluationIntro}</CardDescription>
        </CardHeader>
        <CardContent className="space-y-5">
          <div className="grid gap-4 md:grid-cols-2">
            {evaluationSteps.map(([title, text], index) => <Step key={title} number={index + 1} title={title}>{text}</Step>)}
          </div>
          <Flow items={[
            { icon: Building2, label: ar ? "القسم" : "Classe", tone: "bg-emerald-500/10 text-emerald-600" },
            { icon: BookOpen, label: ar ? "الكفاية" : "Compétence", tone: "bg-violet-500/10 text-violet-600" },
            { icon: Users, label: ar ? "التلاميذ" : "Élèves", tone: "bg-blue-500/10 text-blue-600" },
            { icon: CheckCheck, label: ar ? "حفظ" : "Enregistrer", tone: "bg-amber-500/10 text-amber-600" },
          ]} />
          <div className="flex gap-3 rounded-xl border border-amber-500/25 bg-amber-500/5 p-4 text-sm text-amber-800 dark:text-amber-200">
            <LockKeyhole className="mt-0.5 h-5 w-5 shrink-0" />
            <div><p className="font-semibold">{copy.evaluationLockTitle}</p><p className="mt-1 leading-6 opacity-90">{copy.evaluationLock}</p></div>
          </div>
        </CardContent>
      </Card>

      <Card id="attendance" className="border-emerald-500/25">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-lg"><CalendarCheck className="h-5 w-5 text-emerald-600" />{copy.attendance}</CardTitle>
          <CardDescription className="leading-6">{copy.attendanceIntro}</CardDescription>
        </CardHeader>
        <CardContent className="space-y-5">
          <div className="grid gap-4 md:grid-cols-2">
            {attendanceSteps.map(([title, text], index) => <Step key={title} number={index + 1} title={title}>{text}</Step>)}
          </div>
          <Flow items={[
            { icon: Building2, label: ar ? "القسم والتاريخ" : "Classe et date", tone: "bg-blue-500/10 text-blue-600" },
            { icon: CalendarCheck, label: ar ? "الفترة" : "Période", tone: "bg-violet-500/10 text-violet-600" },
            { icon: Users, label: ar ? "الغياب" : "Absences", tone: "bg-rose-500/10 text-rose-600" },
            { icon: CheckCheck, label: ar ? "حفظ السجل" : "Enregistrer", tone: "bg-emerald-500/10 text-emerald-600" },
          ]} />
          <div className="flex gap-3 rounded-xl border border-emerald-500/25 bg-emerald-500/5 p-4 text-sm text-emerald-800 dark:text-emerald-200">
            <LockKeyhole className="mt-0.5 h-5 w-5 shrink-0" />
            <div><p className="font-semibold">{copy.attendanceLockTitle}</p><p className="mt-1 leading-6 opacity-90">{copy.attendanceLock}</p></div>
          </div>
        </CardContent>
      </Card>

      <Card id="alerts" className="border-blue-500/25">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-lg"><Bell className="h-5 w-5 text-primary" />{copy.alerts}</CardTitle>
          <CardDescription className="leading-6">{copy.alertsIntro}</CardDescription>
        </CardHeader>
        <CardContent className="space-y-5">
          <div className="grid gap-4 md:grid-cols-3">
            {alertSteps.map(([title, text], index) => <Step key={title} number={index + 1} title={title}>{text}</Step>)}
          </div>
          <div className="grid gap-3 md:grid-cols-3">
            <StatusCard icon={AlertTriangle} title={ar ? "حرجة" : "Critiques"} description={ar ? "حالات تحتاج تدخلاً سريعاً أو متابعة." : "Situations qui demandent une intervention ou un suivi rapide."} className="border-destructive/30 bg-destructive/5 text-destructive" />
            <StatusCard icon={Bell} title={ar ? "خفيفة" : "Légères"} description={ar ? "ملاحظات للمتابعة بدون استعجال." : "Points à suivre, sans urgence immédiate."} className="border-amber-500/30 bg-amber-500/5 text-amber-700 dark:text-amber-300" />
            <StatusCard icon={CheckCircle2} title={ar ? "محسومة" : "Résolues"} description={ar ? "حالات عولجت واحتفظ النظام بسجلها." : "Situations traitées, conservées dans l’historique."} className="border-primary/30 bg-primary/5 text-primary" />
          </div>
          <div className="flex items-start gap-3 rounded-xl bg-muted/60 p-4 text-sm text-muted-foreground">
            <Search className="mt-0.5 h-5 w-5 shrink-0 text-primary" />
            <p className="leading-6">{ar ? "لاسترجاع يوم سابق، بدّل خانة التاريخ في سجل النشاط. تظهر العمليات المسجلة فعلاً في ذلك التاريخ." : "Pour retrouver une journée passée, changez la date dans le Journal d’activité. Les opérations réellement enregistrées ce jour-là y apparaissent."}</p>
          </div>
        </CardContent>
      </Card>

      <Card id="principal-classes" className="border-violet-500/25">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-lg"><Trophy className="h-5 w-5 text-violet-600" />{copy.principal}</CardTitle>
          <CardDescription className="leading-6">{copy.principalIntro}</CardDescription>
        </CardHeader>
        <CardContent className="space-y-5">
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <StatusCard icon={CircleAlert} title={ar ? "الحزام الأبيض — أقل من 50%" : "Ceinture blanche — moins de 50 %"} description={ar ? "أولوية: افهم الصعوبة واعقد جلسة متابعة." : "Priorité : comprendre la difficulté et mener un entretien."} className="border-slate-300 bg-slate-50 text-slate-700 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200" />
            <StatusCard icon={CircleAlert} title={ar ? "الحزام الأصفر — 50% إلى 89%" : "Ceinture jaune — 50 à 89 %"} description={ar ? "اتفق على خطة قصيرة وتابع التقدم." : "Fixez une courte action et suivez les progrès."} className="border-amber-500/30 bg-amber-500/5 text-amber-700 dark:text-amber-300" />
            <StatusCard icon={CheckCircle2} title={ar ? "الحزام الأخضر — 90% إلى 98%" : "Ceinture verte — 90 à 98 %"} description={ar ? "تقدم جيد؛ شجّع وواصل الملاحظة." : "Bon progrès : encouragez et continuez l’observation."} className="border-emerald-500/30 bg-emerald-500/5 text-emerald-700 dark:text-emerald-300" />
            <StatusCard icon={CheckCircle2} title={ar ? "الحزام الأزرق — 99% إلى 100%" : "Ceinture bleue — 99 à 100 %"} description={ar ? "المهارات مكتسبة؛ حافظ على التقدم." : "Compétences acquises : maintenez les acquis."} className="border-blue-500/30 bg-blue-500/5 text-blue-700 dark:text-blue-300" />
          </div>
          <div className="grid gap-4 md:grid-cols-2">
            <div className="rounded-xl border border-border bg-muted/30 p-4">
              <p className="font-semibold text-foreground">{ar ? "ماذا تفعل عملياً؟" : "Que faire concrètement ?"}</p>
              <p className="mt-2 text-sm leading-6 text-muted-foreground">{copy.principalAction}</p>
            </div>
            <div className="rounded-xl border border-violet-500/25 bg-violet-500/5 p-4">
              <p className="font-semibold text-violet-800 dark:text-violet-200">{copy.resetTitle}</p>
              <p className="mt-2 text-sm leading-6 text-violet-800/85 dark:text-violet-200/85">{copy.reset}</p>
            </div>
          </div>
        </CardContent>
      </Card>

      <Card className="border-border/60">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-lg"><CircleHelp className="h-5 w-5 text-primary" />{copy.other}</CardTitle>
          <CardDescription className="leading-6">{copy.otherIntro}</CardDescription>
        </CardHeader>
        <CardContent className="grid gap-3 md:grid-cols-2">
          {copy.otherItems.map(([title, description, Icon]) => (
            <div key={title} className="flex gap-3 rounded-xl border border-border/70 p-4">
              <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-muted text-primary"><Icon className="h-4 w-4" /></div>
              <div><p className="text-sm font-semibold text-foreground">{title}</p><p className="mt-1 text-xs leading-5 text-muted-foreground">{description}</p></div>
            </div>
          ))}
        </CardContent>
      </Card>

      <Card className="border-sky-500/25 bg-sky-500/[0.03]">
        <CardContent className="flex flex-col gap-4 p-5 sm:flex-row sm:items-start">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-sky-500/10 text-sky-700 dark:text-sky-300"><Cloud className="h-5 w-5" /></div>
          <div className="flex-1"><h2 className="font-semibold text-foreground">{copy.offlineTitle}</h2><p className="mt-1 text-sm leading-6 text-muted-foreground">{copy.offline}</p></div>
          <Wifi className="hidden h-5 w-5 text-emerald-600 sm:block" />
        </CardContent>
      </Card>

      <section className="rounded-2xl bg-primary p-6 text-primary-foreground md:p-8">
        <h2 className="text-lg font-bold">{copy.finishTitle}</h2>
        <p className="mt-2 max-w-3xl text-sm leading-6 text-primary-foreground/85">{copy.finish}</p>
        <div className="mt-5 flex flex-wrap gap-2">
          <Button asChild variant="secondary" className="gap-2"><Link to="/evaluation"><ClipboardCheck className="h-4 w-4" />{copy.startEvaluation}</Link></Button>
          <Button asChild variant="outline" className="border-primary-foreground/30 bg-transparent text-primary-foreground hover:bg-primary-foreground/10 hover:text-primary-foreground"><Link to="/alerts"><Bell className="me-2 h-4 w-4" />{copy.links.alerts[0]}</Link></Button>
        </div>
      </section>
    </div>
  );
}
