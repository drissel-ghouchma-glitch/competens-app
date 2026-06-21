-- ============================================================
-- Compétens — Requests & Approval System
-- Run this in: Supabase Dashboard > SQL Editor
-- ============================================================

-- ── admin_requests ────────────────────────────────────────
create table if not exists public.admin_requests (
  id           uuid primary key default gen_random_uuid(),
  type         text not null check (type in ('add_student', 'add_competency', 'assign_class')),
  status       text not null default 'pending'
               check (status in ('pending', 'approved', 'rejected')),
  teacher_id   uuid not null references public.profiles(id) on delete cascade,
  data         jsonb not null default '{}',
  admin_note   text,
  reviewed_by  uuid references public.profiles(id),
  reviewed_at  timestamptz,
  created_at   timestamptz not null default now()
);

create index if not exists idx_admin_requests_status     on public.admin_requests(status);
create index if not exists idx_admin_requests_teacher_id on public.admin_requests(teacher_id);

-- RLS
alter table public.admin_requests enable row level security;

-- Admin: read and update all requests
create policy "admin_requests: admin full access" on public.admin_requests
  for all using (public.current_user_role() = 'admin');

-- Teacher: insert own requests + read own requests
create policy "admin_requests: teacher insert" on public.admin_requests
  for insert with check (teacher_id = auth.uid());

create policy "admin_requests: teacher read own" on public.admin_requests
  for select using (teacher_id = auth.uid());

-- ── teacher_class_assignments already exists ──────────────
-- Make sure it allows insert by admin (for approval flow)
-- Drop old policy if exists, then recreate
drop policy if exists "assignments: admin write" on public.teacher_class_assignments;

create policy "assignments: admin write" on public.teacher_class_assignments
  for all using (public.current_user_role() = 'admin');

-- Teacher can read their own assignments
drop policy if exists "assignments: teacher read own" on public.teacher_class_assignments;
create policy "assignments: teacher read own" on public.teacher_class_assignments
  for select using (teacher_id = auth.uid());
