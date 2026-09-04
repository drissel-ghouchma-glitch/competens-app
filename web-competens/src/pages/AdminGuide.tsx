import { Link } from "react-router-dom";
import type { ReactNode } from "react";
import type { LucideIcon } from "lucide-react";
import {
  BarChart3,
  Bell,
  BookOpen,
  Building2,
  CalendarCheck,
  CheckCheck,
  CheckCircle2,
  ChevronRight,
  CircleHelp,
  ClipboardCheck,
  ClipboardList,
  GraduationCap,
  Languages,
  LayoutDashboard,
  LockKeyhole,
  RefreshCw,
  School,
  ShieldCheck,
  Trophy,
  UserCheck,
  UserCog,
  Users,
  Wifi,
} from "lucide-react";
import { useAuth } from "@/hooks/use-auth";
import { useI18n } from "@/i18n";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

type StepProps = {
  number: number;
  title: string;
  children: ReactNode;
};

type GuideLinkProps = {
  to: string;
  icon: LucideIcon;
  label: string;
  description: string;
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

function GuideLink({ to, icon: Icon, label, description }: GuideLinkProps) {
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

function InformationPanel({ icon: Icon, title, children, className }: { icon: LucideIcon; title: string; children: ReactNode; className: string }) {
  return (
    <div className={`flex gap-3 rounded-xl border p-4 text-sm ${className}`}>
      <Icon className="mt-0.5 h-5 w-5 shrink-0" />
      <div>
        <p className="font-semibold">{title}</p>
        <div className="mt-1 leading-6 opacity-90">{children}</div>
      </div>
    </div>
  );
}

export default function AdminGuidePage() {
  const { user } = useAuth();
  const { lang } = useI18n();
  const ar = lang === "ar";

  if (user?.role && user.role !== "admin") {
    return (
      <Card className="mx-auto mt-12 max-w-lg border-border/60">
        <CardContent className="p-8 text-center">
          <CircleHelp className="mx-auto h-10 w-10 text-primary" />
          <h1 className="mt-4 text-xl font-bold">{ar ? "دليل الإدارة" : "Guide administrateur"}</h1>
          <p className="mt-2 text-sm text-muted-foreground">
            {ar ? "هذا الدليل مخصص لحساب الإدارة فقط." : "Ce guide est réservé au compte administrateur."}
          </p>
        </CardContent>
      </Card>
    );
  }

  const copy = ar ? {
    account: "حساب الإدارة",
    title: "دليل استعمال الإدارة",
    subtitle: "دليل واضح وبسيط لإدارة المدرسة ومراجعة ما يرسله الأساتذة، دون الحاجة إلى البحث في كل واجهة.",
    openAttendance: "الحضور المعلّق",
    openRequests: "الطلبات المعلّقة",
    startTitle: "ابدأ من هنا كل يوم",
    startText: "عند ظهور شارة حمراء في الحضور أو الطلبات أو التنبيهات، افتحها أولاً. بعدها راجع مؤشرات المدرسة والتقييمات التي تحتاج متابعة.",
    organization: "1. تنظيم المدرسة",
    organizationText: "أنشئ البنية أولاً: السنة الدراسية، المستويات، ثم الأقسام. بعدها أضف التلاميذ والأساتذة والكفايات. كل عنصر ينعكس في بقية الواجهات.",
    attendance: "2. تأكيد الحضور والتواصل",
    attendanceText: "الحضور الذي يحفظه الأستاذ يصل إلى الإدارة كسجل في الانتظار. لا تحتاج إلى البحث عن الأستاذ أو القسم: افتح السجل من أعلى صفحة الحضور أو من الشارة الحمراء في القائمة.",
    attendanceSteps: [
      ["افتح السجل المنتظر", "تظهر بطاقات السجلات في أعلى صفحة الحضور، مع القسم والأستاذ والتاريخ والفترة وعدد الغائبين."],
      ["راجع حالة التلاميذ", "يبقى الغياب الذي سجله الأستاذ ظاهراً كما هو، ولا يمكن للإدارة تعديله نيابةً عنه."],
      ["حدّد «في الإدارة» عند الحاجة", "للتلميذ الغائب الذي يوجد في الإدارة، فعّل هذه الحالة وأضف السبب إن رغبت؛ السبب اختياري."],
      ["أكّد السجل", "عند التأكيد يُرسل للأستاذ إشعار بالنتيجة، ويرى ولي الأمر الحالة المعتمدة: حاضر، غائب، أو حاضر في الإدارة مع السبب."],
    ] as [string, string][],
    attendanceRule: "مهم: حالة «في الإدارة» لا تغيّر سجل الأستاذ؛ تبقى عنده «غائب» كما سجّلها. إنها فقط الحالة المعتمدة التي تُبلّغ لولي الأمر.",
    alerts: "التنبيهات وسجل النشاط",
    alertsText: "يعرض سجل النشاط عمليات المدرسة حسب اليوم: التقييمات، الحضور، الأستاذ، القسم والتلميذ. استخدم التاريخ والمرشحات للرجوع إلى يوم سابق بدل الاعتماد على نشاط اليوم فقط.",
    review: "3. مراجعة التقييمات والمتابعة التربوية",
    reviewText: "«مراجعة التقييمات» تبدأ بقائمة التلاميذ الذين يحتاجون متابعة من كل الأقسام. قبل اختيار قسم، رتّب القائمة من المجموع الأقل إلى الأعلى، ثم افتح قسم التلميذ لمراجعة التفاصيل.",
    reviewRule: "تشمل القائمة كل تلميذ مجموع تقييماته أقل من 99%، وكذلك من لديه مهارة أقل من 90% حتى لو كان مجموعه 99% أو أكثر.",
    accounts: "4. الحسابات والطلبات",
    accountsText: "طلبات التسجيل خاصة بتفعيل حسابات الأساتذة والآباء وربطها. أما «الطلبات» فتجمع طلبات الأساتذة الخاصة بالقسم أو التلميذ أو الكفاية؛ يمكنك قبولها أو رفضها مع ملاحظة.",
    goodPractice: "5. استعمال يومي آمن",
    goodPracticeText: "استعمل زر «تحديث» لجلب آخر البيانات عند الحاجة. مؤشر المزامنة أسفل القائمة يبين الاتصال والعمليات المعلّقة. لا تغلق سنة دراسية قبل التأكد من اكتمال سجلاتها، لأن الإغلاق يحفظ الأرشيف ويمنع التعديلات العادية.",
    tips: [
      ["لوحة القيادة", "معلومات عامة موحّدة عن المدرسة: الأعداد، النشاط خلال 7 أيام والتنبيهات الحديثة. يمكن للإدارة التحكم في ظهور احتفال النجاح."],
      ["السنوات الدراسية", "أنشئ السنة، فعّل السنة الحالية، ثم أغلقها فقط عند نهاية العمل. الأرشيف يحتفظ بالسجل."],
      ["المستويات والأقسام", "اربط كل قسم بمستوى وسنة دراسية، ثم حدّد سعته وأستاذه الرئيسي عند الحاجة."],
      ["التلاميذ", "أضف أو عدّل التلاميذ، وابحث حسب القسم. يمكن استيراد قائمة Excel بعد مراجعة المعاينة."],
      ["الأساتذة", "عدّل معلومات الأستاذ وأقسامه. يمكن تعيين عدة أقسام رئيسية للأستاذ نفسه، مع بقاء كل قسم مسؤولاً عن أستاذ رئيسي واحد."],
      ["الكفايات", "أنشئ الكفايات وترتيبها ووصفها التربوي. أرشف الكفاية بدل حذفها إن أردت حفظ تاريخ التقييمات."],
      ["تحليل تقييمات الأساتذة", "اختر أستاذاً وقسماً وابحث عن تلميذ. يعرض الجدول عدد التقييمات لكل كفاية والمجموع، ويمكن ترتيبه للمراجعة."],
      ["المستخدمون", "راجع كل الحسابات حسب الدور، وعدّل الاسم والهاتف والدور والحالة، واربط أبناء ولي الأمر بحسابه."],
    ] as [string, string][],
    refresh: "زر التحديث",
    refreshText: "يعيد جلب أحدث بيانات الصفحة الحالية؛ استعمله بعد تأكيد سجل أو معالجة طلب.",
    language: "اللغة والمظهر والخروج",
    languageText: "أسفل القائمة: تغيير اللغة، الوضع الليلي أو النهاري، ثم تسجيل الخروج.",
  } : {
    account: "Compte administrateur",
    title: "Guide d’utilisation de l’administration",
    subtitle: "Un guide clair et simple pour gérer l’école et traiter les actions envoyées par les professeurs.",
    openAttendance: "Présences en attente",
    openRequests: "Demandes en attente",
    startTitle: "Commencez ici chaque jour",
    startText: "Lorsqu’un badge rouge apparaît dans les présences, les demandes ou les alertes, ouvrez-le en priorité. Consultez ensuite les indicateurs de l’école et les évaluations à suivre.",
    organization: "1. Organiser l’école",
    organizationText: "Créez d’abord la structure : année scolaire, niveaux, puis classes. Ajoutez ensuite les élèves, les professeurs et les compétences. Ces éléments sont utilisés dans le reste de l’application.",
    attendance: "2. Confirmer les présences et communiquer",
    attendanceText: "Une présence enregistrée par un professeur arrive comme registre en attente. Il n’est pas nécessaire de rechercher le professeur ou la classe : ouvrez le registre en haut de la page Présences ou depuis le badge rouge du menu.",
    attendanceSteps: [
      ["Ouvrez le registre en attente", "Les cartes en haut de la page indiquent la classe, le professeur, la date, la période et le nombre d’absents."],
      ["Vérifiez les statuts", "L’absence enregistrée par le professeur reste visible telle quelle. L’administration ne la modifie pas à sa place."],
      ["Indiquez « à l’administration » si nécessaire", "Pour un élève absent mais présent à l’administration, activez ce statut et ajoutez une raison si vous le souhaitez ; elle reste facultative."],
      ["Confirmez le registre", "Le professeur reçoit la confirmation. Le parent voit le statut validé : présent, absent, ou présent à l’administration avec sa raison."],
    ] as [string, string][],
    attendanceRule: "Important : le statut « à l’administration » ne modifie pas le registre du professeur, qui conserve « absent ». C’est uniquement le statut communiqué au parent.",
    alerts: "Alertes et journal d’activité",
    alertsText: "Le Journal d’activité affiche les opérations de l’école par journée : évaluations, présences, professeur, classe et élève. Utilisez la date et les filtres pour revenir à une journée passée, pas seulement à l’activité du jour.",
    review: "3. Revue des évaluations et suivi pédagogique",
    reviewText: "La page « Revue des évaluations » commence par les élèves à suivre dans toutes les classes. Avant de choisir une classe, la liste est ordonnée de la moyenne la plus faible à la plus élevée ; ouvrez ensuite la classe de l’élève pour examiner le détail.",
    reviewRule: "La liste contient chaque élève dont la moyenne est inférieure à 99 %, ainsi que ceux ayant une compétence sous 90 % malgré une moyenne d’au moins 99 %.",
    accounts: "4. Comptes et demandes",
    accountsText: "Les demandes d’inscription servent à activer les comptes professeurs et parents et à les relier. La page « Demandes » rassemble les demandes de classe, d’élève ou de compétence faites par les professeurs ; acceptez-les ou refusez-les avec une note.",
    goodPractice: "5. Utilisation quotidienne sûre",
    goodPracticeText: "Utilisez « Actualiser » pour obtenir les données récentes. L’indicateur de synchronisation au bas du menu montre la connexion et les opérations en attente. Ne clôturez une année qu’après vérification des registres, car la clôture conserve l’archive et bloque les modifications ordinaires.",
    tips: [
      ["Tableau de bord", "Informations générales communes à l’école : effectifs, activité sur 7 jours et alertes récentes. L’administration contrôle l’affichage de la célébration de réussite."],
      ["Années scolaires", "Créez l’année, activez l’année en cours, puis clôturez-la à la fin du travail. L’archive garde l’historique."],
      ["Niveaux et classes", "Associez chaque classe à un niveau et à une année scolaire, puis définissez sa capacité et son professeur principal si nécessaire."],
      ["Élèves", "Ajoutez ou modifiez les élèves et recherchez-les par classe. Une liste Excel peut être importée après contrôle de l’aperçu."],
      ["Professeurs", "Modifiez les informations et les classes d’un professeur. Un même professeur peut être principal de plusieurs classes ; chaque classe garde un seul professeur principal."],
      ["Compétences", "Créez les compétences, leur ordre et leur conseil pédagogique. Archivez une compétence plutôt que de la supprimer si vous voulez conserver l’historique."],
      ["Analyse des évaluations", "Choisissez un professeur et une classe, puis recherchez un élève. Le tableau affiche le nombre d’évaluations par compétence et le total, avec des tris de contrôle."],
      ["Utilisateurs", "Consultez les comptes par rôle, modifiez nom, téléphone, rôle et statut, puis associez les enfants au compte parent."],
    ] as [string, string][],
    refresh: "Bouton Actualiser",
    refreshText: "Il récupère les données les plus récentes de la page ouverte. Utilisez-le après avoir confirmé un registre ou traité une demande.",
    language: "Langue, thème et déconnexion",
    languageText: "Au bas du menu : changez de langue, activez le thème clair ou sombre, puis déconnectez-vous.",
  };

  const organizationLinks: GuideLinkProps[] = [
    { to: "/school-years", icon: School, label: ar ? "السنوات الدراسية" : "Années scolaires", description: copy.tips[1][1] },
    { to: "/levels", icon: GraduationCap, label: ar ? "المستويات" : "Niveaux", description: ar ? "أنشئ المستويات التي تستعملها المدرسة قبل ربط الأقسام بها." : "Créez les niveaux utilisés par l’école avant d’y associer les classes." },
    { to: "/classes", icon: Building2, label: ar ? "الأقسام" : "Classes", description: copy.tips[2][1] },
    { to: "/students", icon: Users, label: ar ? "التلاميذ" : "Élèves", description: copy.tips[3][1] },
    { to: "/teachers", icon: UserCog, label: ar ? "الأساتذة" : "Professeurs", description: copy.tips[4][1] },
    { to: "/competencies", icon: BookOpen, label: ar ? "الكفايات" : "Compétences", description: copy.tips[5][1] },
  ];

  const controlLinks: GuideLinkProps[] = [
    { to: "/principal-classes", icon: Trophy, label: ar ? "مراجعة التقييمات" : "Revue des évaluations", description: copy.reviewText },
    { to: "/admin/evaluation-analysis", icon: BarChart3, label: ar ? "تحليل تقييمات الأساتذة" : "Analyse des évaluations", description: copy.tips[6][1] },
    { to: "/attendance", icon: CalendarCheck, label: ar ? "الحضور" : "Présences", description: copy.attendanceText },
    { to: "/alerts", icon: Bell, label: ar ? "التنبيهات" : "Alertes", description: copy.alertsText },
  ];

  const accountLinks: GuideLinkProps[] = [
    { to: "/admin/pending-teachers", icon: UserCheck, label: ar ? "طلبات التسجيل" : "Demandes d’inscription", description: ar ? "فعّل الأساتذة والآباء، واختر أقسام الأستاذ أو أبناء ولي الأمر قبل التأكيد." : "Activez professeurs et parents, puis choisissez les classes du professeur ou les enfants du parent avant validation." },
    { to: "/admin/requests", icon: ClipboardList, label: ar ? "الطلبات" : "Demandes", description: copy.accountsText },
    { to: "/admin/users", icon: ShieldCheck, label: ar ? "المستخدمون" : "Utilisateurs", description: copy.tips[7][1] },
  ];

  return (
    <div className="mx-auto max-w-6xl space-y-6 animate-in fade-in duration-500">
      <section className="overflow-hidden rounded-2xl border border-primary/20 bg-gradient-to-br from-primary/10 via-background to-background p-5 md:p-8">
        <Badge className="gap-1.5 bg-primary/15 text-primary hover:bg-primary/15" variant="secondary">
          <ShieldCheck className="h-3.5 w-3.5" /> {copy.account}
        </Badge>
        <h1 className="mt-3 text-2xl font-bold tracking-tight md:text-3xl">{copy.title}</h1>
        <p className="mt-2 max-w-2xl text-sm leading-6 text-muted-foreground">{copy.subtitle}</p>
        <div className="mt-5 flex flex-wrap gap-2">
          <Button asChild className="gap-2"><Link to="/attendance"><CalendarCheck className="h-4 w-4" />{copy.openAttendance}</Link></Button>
          <Button asChild variant="outline" className="gap-2"><Link to="/admin/requests"><ClipboardList className="h-4 w-4" />{copy.openRequests}</Link></Button>
        </div>
      </section>

      <Card className="border-border/60">
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-lg"><CheckCheck className="h-5 w-5 text-primary" />{copy.startTitle}</CardTitle>
          <CardDescription className="leading-6">{copy.startText}</CardDescription>
        </CardHeader>
        <CardContent className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <GuideLink to="/dashboard" icon={LayoutDashboard} label={ar ? "لوحة القيادة" : "Tableau de bord"} description={copy.tips[0][1]} />
          <GuideLink to="/attendance" icon={CalendarCheck} label={ar ? "الحضور" : "Présences"} description={ar ? "ابدأ بالسجلات التي تنتظر التأكيد." : "Commencez par les registres qui attendent votre confirmation."} />
          <GuideLink to="/admin/requests" icon={ClipboardList} label={ar ? "الطلبات" : "Demandes"} description={ar ? "عالج طلبات الأساتذة الواردة." : "Traitez les demandes envoyées par les professeurs."} />
          <GuideLink to="/principal-classes" icon={Trophy} label={ar ? "مراجعة التقييمات" : "Revue des évaluations"} description={ar ? "تابع التلاميذ الذين يحتاجون تدخلاً." : "Suivez les élèves qui demandent une intervention."} />
        </CardContent>
      </Card>

      <Card className="border-blue-500/25">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-lg"><Building2 className="h-5 w-5 text-blue-600" />{copy.organization}</CardTitle>
          <CardDescription className="leading-6">{copy.organizationText}</CardDescription>
        </CardHeader>
        <CardContent className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {organizationLinks.map((link) => <GuideLink key={link.to} {...link} />)}
        </CardContent>
      </Card>

      <Card className="border-emerald-500/25">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-lg"><CalendarCheck className="h-5 w-5 text-emerald-600" />{copy.attendance}</CardTitle>
          <CardDescription className="leading-6">{copy.attendanceText}</CardDescription>
        </CardHeader>
        <CardContent className="space-y-5">
          <div className="grid gap-4 md:grid-cols-2">
            {copy.attendanceSteps.map(([title, text], index) => <Step key={title} number={index + 1} title={title}>{text}</Step>)}
          </div>
          <Flow items={[
            { icon: Bell, label: ar ? "شارة حمراء" : "Badge rouge", tone: "bg-rose-500/10 text-rose-600" },
            { icon: CalendarCheck, label: ar ? "سجل معلّق" : "Registre en attente", tone: "bg-amber-500/10 text-amber-600" },
            { icon: Users, label: ar ? "حالة الإدارة" : "Statut administration", tone: "bg-violet-500/10 text-violet-600" },
            { icon: CheckCircle2, label: ar ? "تأكيد وإشعار" : "Confirmer et notifier", tone: "bg-emerald-500/10 text-emerald-600" },
          ]} />
          <InformationPanel icon={LockKeyhole} title={ar ? "سجل الأستاذ محفوظ" : "Le registre du professeur est conservé"} className="border-emerald-500/25 bg-emerald-500/5 text-emerald-800 dark:text-emerald-200">
            {copy.attendanceRule}
          </InformationPanel>
          <InformationPanel icon={Bell} title={copy.alerts} className="border-primary/25 bg-primary/5 text-primary">
            {copy.alertsText}
          </InformationPanel>
        </CardContent>
      </Card>

      <Card className="border-violet-500/25">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-lg"><ClipboardCheck className="h-5 w-5 text-violet-600" />{copy.review}</CardTitle>
          <CardDescription className="leading-6">{copy.reviewText}</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <InformationPanel icon={Trophy} title={ar ? "من يظهر في قائمة المراجعة؟" : "Qui apparaît dans la liste de revue ?"} className="border-violet-500/25 bg-violet-500/5 text-violet-800 dark:text-violet-200">
            {copy.reviewRule}
          </InformationPanel>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            {controlLinks.map((link) => <GuideLink key={link.to} {...link} />)}
          </div>
        </CardContent>
      </Card>

      <Card className="border-amber-500/25">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-lg"><ShieldCheck className="h-5 w-5 text-amber-600" />{copy.accounts}</CardTitle>
          <CardDescription className="leading-6">{copy.accountsText}</CardDescription>
        </CardHeader>
        <CardContent className="grid gap-3 md:grid-cols-3">
          {accountLinks.map((link) => <GuideLink key={link.to} {...link} />)}
        </CardContent>
      </Card>

      <Card className="border-border/60">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-lg"><Wifi className="h-5 w-5 text-primary" />{copy.goodPractice}</CardTitle>
          <CardDescription className="leading-6">{copy.goodPracticeText}</CardDescription>
        </CardHeader>
        <CardContent className="grid gap-3 md:grid-cols-2">
          <InformationPanel icon={RefreshCw} title={copy.refresh} className="border-border bg-muted/40 text-foreground">
            {copy.refreshText}
          </InformationPanel>
          <InformationPanel icon={Languages} title={copy.language} className="border-border bg-muted/40 text-foreground">
            {copy.languageText}
          </InformationPanel>
        </CardContent>
      </Card>
    </div>
  );
}
