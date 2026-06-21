-- ============================================================
-- Compétens — Supabase Schema
-- Run this in: Supabase Dashboard > SQL Editor
-- ============================================================

-- ──────────────────────────────────────────────────────────
-- 1. PROFILES (extends Supabase auth.users)
-- ──────────────────────────────────────────────────────────
create table if not exists public.profiles (
  id          uuid primary key references auth.users(id) on delete cascade,
  email       text not null,
  full_name   text not null default '',
  role        text not null default 'professeur'
              check (role in ('admin', 'directeur', 'professeur')),
  status      text not null default 'pending'
              check (status in ('active', 'pending', 'suspended')),
  phone       text,
  avatar_url  text,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

-- Auto-create profile row when a new auth user is created
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer as $$
begin
  insert into public.profiles (id, email, full_name, role, status)
  values (
    new.id,
    new.email,
    coalesce(new.raw_user_meta_data->>'full_name', ''),
    coalesce(new.raw_user_meta_data->>'role', 'professeur'),
    case
      when coalesce(new.raw_user_meta_data->>'role', 'professeur') = 'professeur' then 'pending'
      else 'active'
    end
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure public.handle_new_user();

-- ──────────────────────────────────────────────────────────
-- 2. SCHOOL YEARS
-- ──────────────────────────────────────────────────────────
create table if not exists public.school_years (
  id          uuid primary key default gen_random_uuid(),
  name        text not null,
  start_date  date not null,
  end_date    date not null,
  is_active   boolean not null default false,
  is_closed   boolean not null default false,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

-- ──────────────────────────────────────────────────────────
-- 3. LEVELS
-- ──────────────────────────────────────────────────────────
create table if not exists public.levels (
  id          uuid primary key default gen_random_uuid(),
  name        text not null,
  code        text not null unique,
  is_archived boolean not null default false,
  created_at  timestamptz not null default now()
);

-- ──────────────────────────────────────────────────────────
-- 4. CLASSES
-- ──────────────────────────────────────────────────────────
create table if not exists public.classes (
  id             uuid primary key default gen_random_uuid(),
  name           text not null,
  level_id       uuid references public.levels(id) on delete set null,
  teacher_id     uuid references public.profiles(id) on delete set null,
  school_year_id uuid references public.school_years(id) on delete cascade,
  capacity       integer not null default 30,
  student_count  integer not null default 0,
  is_archived    boolean not null default false,
  created_at     timestamptz not null default now()
);

-- ──────────────────────────────────────────────────────────
-- 5. STUDENTS
-- ──────────────────────────────────────────────────────────
create table if not exists public.students (
  id          uuid primary key default gen_random_uuid(),
  first_name  text not null,
  last_name   text not null,
  birth_date  date,
  gender      text check (gender in ('M', 'F')),
  class_id    uuid references public.classes(id) on delete set null,
  photo_url   text,
  created_at  timestamptz not null default now()
);

-- ──────────────────────────────────────────────────────────
-- 6. COMPETENCIES
-- ──────────────────────────────────────────────────────────
create table if not exists public.competencies (
  id                  uuid primary key default gen_random_uuid(),
  code                text not null unique,
  title               text not null,
  description         text not null default '',
  pedagogical_advice  text not null default '',
  "order"             integer not null default 0,
  created_at          timestamptz not null default now()
);

-- ──────────────────────────────────────────────────────────
-- 7. EVALUATIONS
-- ──────────────────────────────────────────────────────────
create table if not exists public.evaluations (
  id             uuid primary key default gen_random_uuid(),
  student_id     uuid not null references public.students(id) on delete cascade,
  competency_id  uuid not null references public.competencies(id) on delete cascade,
  teacher_id     uuid references public.profiles(id) on delete set null,
  class_id       uuid references public.classes(id) on delete set null,
  status         text not null check (status in ('acquis', 'en_cours', 'non_acquis')),
  date           date not null default current_date,
  created_at     timestamptz not null default now()
);

create index if not exists idx_evaluations_student on public.evaluations(student_id);
create index if not exists idx_evaluations_date on public.evaluations(date);

-- ──────────────────────────────────────────────────────────
-- 8. ALERTS
-- ──────────────────────────────────────────────────────────
create table if not exists public.alerts (
  id           uuid primary key default gen_random_uuid(),
  student_id   uuid not null references public.students(id) on delete cascade,
  level        text not null check (level in ('warning', 'critical')),
  cause        text not null,
  date         date not null default current_date,
  resolved     boolean not null default false,
  resolved_at  timestamptz,
  created_at   timestamptz not null default now()
);

-- ──────────────────────────────────────────────────────────
-- 9. NOTIFICATIONS
-- ──────────────────────────────────────────────────────────
create table if not exists public.notifications (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid references public.profiles(id) on delete cascade,
  title       text not null,
  message     text not null,
  read        boolean not null default false,
  type        text not null check (type in ('alert', 'info', 'evaluation')),
  related_id  uuid,
  created_at  timestamptz not null default now()
);

-- ──────────────────────────────────────────────────────────
-- 10. TEACHER CLASS ASSIGNMENTS
-- ──────────────────────────────────────────────────────────
create table if not exists public.teacher_class_assignments (
  id          uuid primary key default gen_random_uuid(),
  teacher_id  uuid not null references public.profiles(id) on delete cascade,
  class_id    uuid not null references public.classes(id) on delete cascade,
  unique (teacher_id, class_id)
);

-- ============================================================
-- ROW LEVEL SECURITY
-- ============================================================

alter table public.profiles enable row level security;
alter table public.school_years enable row level security;
alter table public.levels enable row level security;
alter table public.classes enable row level security;
alter table public.students enable row level security;
alter table public.competencies enable row level security;
alter table public.evaluations enable row level security;
alter table public.alerts enable row level security;
alter table public.notifications enable row level security;
alter table public.teacher_class_assignments enable row level security;

-- Helper: get current user role (SECURITY DEFINER bypasses RLS to avoid recursion)
create or replace function public.current_user_role()
returns text language plpgsql stable security definer
set search_path = public as $$
declare v_role text;
begin
  select role into v_role from public.profiles where id = auth.uid();
  return coalesce(v_role, '');
end;
$$;

create or replace function public.current_user_status()
returns text language plpgsql stable security definer
set search_path = public as $$
declare v_status text;
begin
  select status into v_status from public.profiles where id = auth.uid();
  return coalesce(v_status, '');
end;
$$;

-- ── PROFILES ──────────────────────────────────────────────
-- Users can read their own profile
create policy "profiles: self read" on public.profiles
  for select using (id = auth.uid());

-- Admin/directeur can read all profiles
create policy "profiles: admin/directeur read all" on public.profiles
  for select using (public.current_user_role() in ('admin', 'directeur'));

-- Admin can update any profile (for approvals)
create policy "profiles: admin update" on public.profiles
  for update using (public.current_user_role() = 'admin');

-- Users can update their own profile
create policy "profiles: self update" on public.profiles
  for update using (id = auth.uid());

-- ── SCHOOL YEARS ──────────────────────────────────────────
create policy "school_years: active users read" on public.school_years
  for select using (public.current_user_status() = 'active');

create policy "school_years: admin write" on public.school_years
  for all using (public.current_user_role() = 'admin');

-- ── LEVELS ────────────────────────────────────────────────
create policy "levels: active users read" on public.levels
  for select using (public.current_user_status() = 'active');

create policy "levels: admin write" on public.levels
  for all using (public.current_user_role() = 'admin');

-- ── CLASSES ───────────────────────────────────────────────
-- Admin and directeur see all classes
create policy "classes: admin/directeur read" on public.classes
  for select using (public.current_user_role() in ('admin', 'directeur'));

-- Teachers see only their assigned classes
create policy "classes: teacher read own" on public.classes
  for select using (
    public.current_user_role() = 'professeur'
    and teacher_id = auth.uid()
  );

create policy "classes: admin write" on public.classes
  for all using (public.current_user_role() = 'admin');

-- ── STUDENTS ──────────────────────────────────────────────
create policy "students: admin/directeur read all" on public.students
  for select using (public.current_user_role() in ('admin', 'directeur'));

create policy "students: teacher read own class" on public.students
  for select using (
    public.current_user_role() = 'professeur'
    and class_id in (
      select id from public.classes where teacher_id = auth.uid()
    )
  );

create policy "students: admin write" on public.students
  for all using (public.current_user_role() = 'admin');

-- ── COMPETENCIES ──────────────────────────────────────────
create policy "competencies: active users read" on public.competencies
  for select using (public.current_user_status() = 'active');

create policy "competencies: admin write" on public.competencies
  for all using (public.current_user_role() = 'admin');

-- ── EVALUATIONS ───────────────────────────────────────────
create policy "evaluations: admin/directeur read all" on public.evaluations
  for select using (public.current_user_role() in ('admin', 'directeur'));

create policy "evaluations: teacher read/write own" on public.evaluations
  for all using (
    public.current_user_role() = 'professeur'
    and teacher_id = auth.uid()
  );

-- ── ALERTS ────────────────────────────────────────────────
create policy "alerts: active users read" on public.alerts
  for select using (public.current_user_status() = 'active');

create policy "alerts: admin write" on public.alerts
  for all using (public.current_user_role() = 'admin');

-- Teachers can resolve alerts for their students
create policy "alerts: teacher update own class" on public.alerts
  for update using (
    public.current_user_role() = 'professeur'
    and student_id in (
      select s.id from public.students s
      join public.classes c on c.id = s.class_id
      where c.teacher_id = auth.uid()
    )
  );

-- ── NOTIFICATIONS ─────────────────────────────────────────
create policy "notifications: own" on public.notifications
  for all using (user_id = auth.uid());

-- ── TEACHER CLASS ASSIGNMENTS ─────────────────────────────
create policy "assignments: active users read" on public.teacher_class_assignments
  for select using (public.current_user_status() = 'active');

create policy "assignments: admin write" on public.teacher_class_assignments
  for all using (public.current_user_role() = 'admin');
