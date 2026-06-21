import type {
  SchoolYear, Level, Classe, Student, Teacher,
  Competency, Evaluation, Alert, Notification,
} from "@/types";

export const COMPETENCIES_SEED: Omit<Competency, "id" | "createdAt">[] = [
  { code: "C1", title: "Respect des règles et de l'ordre général", description: "L'élève respecte le règlement intérieur, les consignes collectives et l'autorité de l'enseignant.", pedagogicalAdvice: "Établir des règles claires, expliciter les attentes, valoriser les comportements positifs, instaurer des rituels de classe.", order: 1 },
  { code: "C2", title: "Préparation et concentration", description: "L'élève arrive en classe avec le matériel nécessaire et se met rapidement au travail.", pedagogicalAdvice: "Instaurer une routine d'entrée en classe, vérifier le matériel, proposer des activités de transition courtes.", order: 2 },
  { code: "C3", title: "Discipline et engagement durant la leçon", description: "L'élève maintient une attitude de travail tout au long de la séance sans perturber la classe.", pedagogicalAdvice: "Varier les modalités de travail, proposer des pauses cognitives, valoriser l'effort et la persévérance.", order: 3 },
  { code: "C4", title: "Gestion du matériel", description: "L'élève prend soin du matériel collectif et individuel mis à disposition.", pedagogicalAdvice: "Attribuer des responsabilités matérielles, modéliser le rangement, instaurer un temps dédié au rangement.", order: 4 },
  { code: "C5", title: "Écoute et participation actives", description: "L'élève écoute l'enseignant et ses camarades, participe aux échanges et pose des questions pertinentes.", pedagogicalAdvice: "Utiliser des bâtons de parole, encourager la reformulation, valoriser les questions posées.", order: 5 },
  { code: "C6", title: "Persévérance et achèvement des tâches", description: "L'élève va au bout des exercices demandés sans abandonner face à la difficulté.", pedagogicalAdvice: "Fragmenter les tâches complexes, proposer des niveaux de difficulté progressifs, célébrer l'achèvement.", order: 6 },
  { code: "C7", title: "Autonomie dans le travail", description: "L'élève est capable de travailler seul après avoir compris la consigne.", pedagogicalAdvice: "Expliciter les consignes, proposer des plans de travail, développer l'auto-évaluation.", order: 7 },
  { code: "C8", title: "Coopération et travail en équipe", description: "L'élève coopère avec ses pairs dans les activités collectives, partage les tâches, écoute les idées des autres et contribue au groupe.", pedagogicalAdvice: "Former des groupes hétérogènes, attribuer des rôles tournants, enseigner les compétences sociales de coopération.", order: 8 },
  { code: "C9", title: "Expression orale et communication", description: "L'élève s'exprime clairement à l'oral, avec un vocabulaire adapté et une syntaxe correcte, en s'adressant à ses pairs et à l'enseignant.", pedagogicalAdvice: "Multiplier les situations de prise de parole, enseigner le vocabulaire spécifique, pratiquer exposés et débats.", order: 9 },
  { code: "C10", title: "Compréhension et restitution", description: "L'élève comprend les consignes et les contenus enseignés et est capable de les restituer avec ses propres mots.", pedagogicalAdvice: "Pratiquer la reformulation, utiliser des supports visuels, proposer des activités de résumé et de schématisation.", order: 10 },
  { code: "C11", title: "Créativité et initiative", description: "L'élève propose des idées originales, prend des initiatives dans les tâches ouvertes et fait preuve d'imagination.", pedagogicalAdvice: "Proposer des activités ouvertes, valoriser les solutions originales, organiser des ateliers créatifs.", order: 11 },
  { code: "C12", title: "Progrès et évolution personnelle", description: "L'élève est conscient de ses progrès et de ses difficultés, et s'engage activement dans son évolution personnelle.", pedagogicalAdvice: "Pratiquer l'auto-évaluation, tenir un carnet de progrès, célébrer les évolutions individuelles.", order: 12 },
];

export const LEVELS_SEED: Omit<Level, "id" | "createdAt">[] = [
  { name: "CP1", code: "CP1", isArchived: false },
  { name: "CP2", code: "CP2", isArchived: false },
  { name: "CE1", code: "CE1", isArchived: false },
  { name: "CE2", code: "CE2", isArchived: false },
  { name: "CM1", code: "CM1", isArchived: false },
  { name: "CM2", code: "CM2", isArchived: false },
];

function uid(): string {
  return Math.random().toString(36).substring(2, 10);
}

export function generateDemoData() {
  const now = new Date();
  const schoolYearId = uid();
  const schoolYear: SchoolYear = {
    id: schoolYearId,
    name: "2025-2026",
    startDate: "2025-09-01",
    endDate: "2026-07-03",
    isActive: true,
    isClosed: false,
    createdAt: now.toISOString(),
    updatedAt: now.toISOString(),
  };

  const levels: Level[] = LEVELS_SEED.map((l) => ({
    ...l,
    id: uid(),
    createdAt: now.toISOString(),
  }));

  const levelMap = new Map(levels.map((l) => [l.name, l]));

  const teachers: Teacher[] = [
    { id: uid(), userId: "t1", firstName: "Sophie", lastName: "Diallo", email: "sophie.diallo@ecole.sn", phone: "+221 77 111 22 33", createdAt: now.toISOString() },
    { id: uid(), userId: "t2", firstName: "Mamadou", lastName: "Sow", email: "mamadou.sow@ecole.sn", phone: "+221 77 222 33 44", createdAt: now.toISOString() },
    { id: uid(), userId: "t3", firstName: "Aminata", lastName: "Ba", email: "aminata.ba@ecole.sn", phone: "+221 77 333 44 55", createdAt: now.toISOString() },
    { id: uid(), userId: "t4", firstName: "Ousmane", lastName: "Fall", email: "ousmane.fall@ecole.sn", phone: "+221 77 444 55 66", createdAt: now.toISOString() },
  ];

  const classes: Classe[] = [
    { id: uid(), name: "CP1-A", levelId: levelMap.get("CP1")!.id, teacherId: teachers[0].id, capacity: 35, studentCount: 0, isArchived: false, schoolYearId, createdAt: now.toISOString() },
    { id: uid(), name: "CP2-A", levelId: levelMap.get("CP2")!.id, teacherId: teachers[1].id, capacity: 30, studentCount: 0, isArchived: false, schoolYearId, createdAt: now.toISOString() },
    { id: uid(), name: "CE1-A", levelId: levelMap.get("CE1")!.id, teacherId: teachers[2].id, capacity: 32, studentCount: 0, isArchived: false, schoolYearId, createdAt: now.toISOString() },
    { id: uid(), name: "CM1-A", levelId: levelMap.get("CM1")!.id, teacherId: teachers[3].id, capacity: 28, studentCount: 0, isArchived: false, schoolYearId, createdAt: now.toISOString() },
  ];

  const classMap = new Map(classes.map((c) => [c.name, c]));

  const firstNames = ["Fatou", "Aïssatou", "Mariama", "Khadija", "Rokhaya", "Moussa", "Ibrahima", "Abdoulaye", "Cheikh", "Amadou", "Alioune", "Pape", "Ndèye", "Dieynaba", "Aminata", "Oumar", "Babacar", "Demba", "Souleymane", "Modou"];
  const lastNames = ["Ndiaye", "Diop", "Sow", "Fall", "Ba", "Diallo", "Sarr", "Gueye", "Diouf", "Seck", "Mbacké", "Faye", "Thiam", "Niang", "Cissé", "Mbengue", "Kane", "Dieng", "Camara", "Sy"];

  const students: Student[] = [];
  const classNames = ["CP1-A", "CP2-A", "CE1-A", "CM1-A"];

  for (let ci = 0; ci < classNames.length; ci++) {
    const className = classNames[ci];
    const cls = classMap.get(className)!;
    for (let i = 0; i < 12; i++) {
      const fn = firstNames[(ci * 5 + i * 3) % firstNames.length];
      const ln = lastNames[(ci * 4 + i * 2) % lastNames.length];
      const year = 2014 + ci;
      const month = (i % 12) + 1;
      students.push({
        id: uid(),
        firstName: fn,
        lastName: ln,
        birthDate: `${year}-${String(month).padStart(2, "0")}-${String((i % 28) + 1).padStart(2, "0")}`,
        gender: i % 3 === 0 ? "F" : "M",
        classId: cls.id,
        createdAt: now.toISOString(),
      });
    }
  }

  classes.forEach((c) => { c.studentCount = students.filter((s) => s.classId === c.id).length; });

  const competencies: Competency[] = COMPETENCIES_SEED.map((c) => ({
    ...c,
    id: uid(),
    createdAt: now.toISOString(),
  }));

  const evaluations: Evaluation[] = [];
  const statuses: ("acquis" | "en_cours" | "non_acquis")[] = ["acquis", "acquis", "acquis", "en_cours", "non_acquis"];

  for (const student of students) {
    for (const competency of competencies) {
      for (let w = 0; w < 4; w++) {
        const d = new Date(now);
        d.setDate(d.getDate() - w * 7 - Math.floor(Math.random() * 3));
        evaluations.push({
          id: uid(),
          studentId: student.id,
          competencyId: competency.id,
          teacherId: classes.find((c) => c.id === student.classId)?.teacherId ?? teachers[0].id,
          classId: student.classId,
          status: statuses[Math.floor(Math.random() * statuses.length)],
          date: d.toISOString().split("T")[0],
          createdAt: d.toISOString(),
        });
      }
    }
  }

  const alerts: Alert[] = [];
  const strugglingStudents = students.filter((_, i) => i % 7 === 0);
  for (const s of strugglingStudents) {
    alerts.push({
      id: uid(),
      studentId: s.id,
      level: Math.random() > 0.5 ? "warning" : "critical",
      cause: "Plusieurs compétences non acquises sur les 4 dernières semaines",
      date: now.toISOString().split("T")[0],
      resolved: false,
      createdAt: now.toISOString(),
    });
  }

  const notifications: Notification[] = [];
  for (const a of alerts) {
    notifications.push({
      id: uid(),
      userId: classes.find((c) => c.id === students.find((s) => s.id === a.studentId)?.classId)?.teacherId ?? teachers[0].id,
      title: a.level === "critical" ? "🔴 Alerte importante" : "🟠 Alerte légère",
      message: `${students.find((s) => s.id === a.studentId)?.firstName ?? "Élève"} ${students.find((s) => s.id === a.studentId)?.lastName ?? ""} : ${a.cause}`,
      read: false,
      type: "alert",
      relatedId: a.id,
      createdAt: now.toISOString(),
    });
  }

  return { schoolYears: [schoolYear], levels, classes, students, teachers: teachers.map((t) => ({ ...t })), competencies, evaluations, alerts, notifications };
}
