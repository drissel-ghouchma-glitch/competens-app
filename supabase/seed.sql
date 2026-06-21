-- ============================================================
-- Compétens — Demo Seed Data
-- Run AFTER schema.sql
-- ============================================================

-- ── School Year ──────────────────────────────────────────
insert into public.school_years (id, name, start_date, end_date, is_active)
values ('00000000-0000-0000-0000-000000000001', '2025-2026', '2025-09-01', '2026-07-03', true)
on conflict do nothing;

-- ── Levels ───────────────────────────────────────────────
insert into public.levels (id, name, code) values
  ('10000000-0000-0000-0000-000000000001', 'CP1', 'CP1'),
  ('10000000-0000-0000-0000-000000000002', 'CP2', 'CP2'),
  ('10000000-0000-0000-0000-000000000003', 'CE1', 'CE1'),
  ('10000000-0000-0000-0000-000000000004', 'CE2', 'CE2'),
  ('10000000-0000-0000-0000-000000000005', 'CM1', 'CM1'),
  ('10000000-0000-0000-0000-000000000006', 'CM2', 'CM2')
on conflict do nothing;

-- ── Competencies (C1–C12) ─────────────────────────────────
insert into public.competencies (code, title, description, pedagogical_advice, "order") values
  ('C1',  'Respect des règles et de l''ordre général',
          'L''élève respecte le règlement intérieur, les consignes collectives et l''autorité de l''enseignant.',
          'Établir des règles claires, expliciter les attentes, valoriser les comportements positifs, instaurer des rituels de classe.', 1),
  ('C2',  'Préparation et concentration',
          'L''élève arrive en classe avec le matériel nécessaire et se met rapidement au travail.',
          'Instaurer une routine d''entrée en classe, vérifier le matériel, proposer des activités de transition courtes.', 2),
  ('C3',  'Discipline et engagement durant la leçon',
          'L''élève maintient une attitude de travail tout au long de la séance sans perturber la classe.',
          'Varier les modalités de travail, proposer des pauses cognitives, valoriser l''effort et la persévérance.', 3),
  ('C4',  'Gestion du matériel',
          'L''élève prend soin du matériel collectif et individuel mis à disposition.',
          'Attribuer des responsabilités matérielles, modéliser le rangement, instaurer un temps dédié au rangement.', 4),
  ('C5',  'Écoute et participation actives',
          'L''élève écoute l''enseignant et ses camarades, participe aux échanges et pose des questions pertinentes.',
          'Utiliser des bâtons de parole, encourager la reformulation, valoriser les questions posées.', 5),
  ('C6',  'Persévérance et achèvement des tâches',
          'L''élève va au bout des exercices demandés sans abandonner face à la difficulté.',
          'Fragmenter les tâches complexes, proposer des niveaux de difficulté progressifs, célébrer l''achèvement.', 6),
  ('C7',  'Autonomie dans le travail',
          'L''élève est capable de travailler seul après avoir compris la consigne.',
          'Expliciter les consignes, proposer des plans de travail, développer l''auto-évaluation.', 7),
  ('C8',  'Coopération et travail en équipe',
          'L''élève coopère avec ses pairs dans les activités collectives, partage les tâches, écoute les idées des autres et contribue au groupe.',
          'Former des groupes hétérogènes, attribuer des rôles tournants, enseigner les compétences sociales de coopération.', 8),
  ('C9',  'Expression orale et communication',
          'L''élève s''exprime clairement à l''oral, avec un vocabulaire adapté et une syntaxe correcte, en s''adressant à ses pairs et à l''enseignant.',
          'Multiplier les situations de prise de parole, enseigner le vocabulaire spécifique, pratiquer exposés et débats.', 9),
  ('C10', 'Compréhension et restitution',
          'L''élève comprend les consignes et les contenus enseignés et est capable de les restituer avec ses propres mots.',
          'Pratiquer la reformulation, utiliser des supports visuels, proposer des activités de résumé et de schématisation.', 10),
  ('C11', 'Créativité et initiative',
          'L''élève propose des idées originales, prend des initiatives dans les tâches ouvertes et fait preuve d''imagination.',
          'Proposer des activités ouvertes, valoriser les solutions originales, organiser des ateliers créatifs.', 11),
  ('C12', 'Progrès et évolution personnelle',
          'L''élève est conscient de ses progrès et de ses difficultés, et s''engage activement dans son évolution personnelle.',
          'Pratiquer l''auto-évaluation, tenir un carnet de progrès, célébrer les évolutions individuelles.', 12)
on conflict (code) do update
  set title = excluded.title,
      description = excluded.description,
      pedagogical_advice = excluded.pedagogical_advice;

-- ── Admin account ─────────────────────────────────────────
-- NOTE: Create this user first via Supabase Auth dashboard or API,
-- then update the profile status to 'active' with role 'admin'.
-- Example (replace <admin-uuid> with actual UUID from auth.users):
--
-- update public.profiles
--   set role = 'admin', status = 'active', full_name = 'Administrateur'
-- where id = '<admin-uuid>';
--
-- OR insert directly if you know the UUID:
-- insert into public.profiles (id, email, full_name, role, status)
-- values ('<admin-uuid>', 'admin@competens.sn', 'Administrateur', 'admin', 'active')
-- on conflict (id) do update set role = 'admin', status = 'active';
