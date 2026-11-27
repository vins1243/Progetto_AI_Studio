-- ============================================================================
-- MINERVAAI - SCHEMA DATABASE SUPABASE (PRODUZIONE SAAS)
-- Eseguire questo script nell'SQL Editor di Supabase (Dashboard -> SQL Editor)
-- ============================================================================

-- 1. TABELLA PROFILES (Utenti, Abbonamento Stripe e Quote Mensili AI)
create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  email text,
  full_name text,
  subscription_status text not null default 'free', -- 'free' | 'active' | 'past_due' | 'canceled'
  is_premium boolean not null default false,
  plan_type text not null default 'free',           -- 'free' | 'pro_monthly_14.99'
  stripe_customer_id text,
  stripe_subscription_id text,
  current_period_end timestamptz,
  tos_accepted_at timestamptz,
  -- Contatori utilizzo mensile (resettati automaticamente al cambio mese YYYY-MM)
  usage_period text not null default to_char(now(), 'YYYY-MM'),
  usage_chat_count integer not null default 0,
  usage_lesson_count integer not null default 0,
  usage_quiz_count integer not null default 0,
  usage_map_count integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Aggiunta colonne idempotente nel caso la tabella profiles esista già
alter table public.profiles add column if not exists email text;
alter table public.profiles add column if not exists full_name text;
alter table public.profiles add column if not exists subscription_status text not null default 'free';
alter table public.profiles add column if not exists is_premium boolean not null default false;
alter table public.profiles add column if not exists plan_type text not null default 'free';
alter table public.profiles add column if not exists stripe_customer_id text;
alter table public.profiles add column if not exists stripe_subscription_id text;
alter table public.profiles add column if not exists current_period_end timestamptz;
alter table public.profiles add column if not exists tos_accepted_at timestamptz;
alter table public.profiles add column if not exists usage_period text not null default to_char(now(), 'YYYY-MM');
alter table public.profiles add column if not exists usage_chat_count integer not null default 0;
alter table public.profiles add column if not exists usage_lesson_count integer not null default 0;
alter table public.profiles add column if not exists usage_quiz_count integer not null default 0;
alter table public.profiles add column if not exists usage_map_count integer not null default 0;
alter table public.profiles add column if not exists created_at timestamptz not null default now();
alter table public.profiles add column if not exists updated_at timestamptz not null default now();

create index if not exists idx_profiles_stripe_customer on public.profiles(stripe_customer_id);

-- 2. TRIGGER CREAZIONE AUTOMATICA PROFILO AL SIGNUP
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  insert into public.profiles (id, email, full_name)
  values (
    new.id,
    new.email,
    coalesce(new.raw_user_meta_data->>'full_name', '')
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure public.handle_new_user();

-- 3. PROTEZIONE COLONNE SENSIBILI (Impedisce al client di attivare Pro o resettare le quote)
create or replace function public.protect_profile_billing_columns()
returns trigger
language plpgsql
as $$
begin
  if current_user is distinct from 'service_role'
     and current_setting('request.jwt.claim.role', true) is distinct from 'service_role' then
    new.subscription_status := old.subscription_status;
    new.is_premium := old.is_premium;
    new.plan_type := old.plan_type;
    new.stripe_customer_id := old.stripe_customer_id;
    new.stripe_subscription_id := old.stripe_subscription_id;
    new.current_period_end := old.current_period_end;
    new.usage_period := old.usage_period;
    new.usage_chat_count := old.usage_chat_count;
    new.usage_lesson_count := old.usage_lesson_count;
    new.usage_quiz_count := old.usage_quiz_count;
    new.usage_map_count := old.usage_map_count;
  end if;
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists trg_protect_profile_billing on public.profiles;
create trigger trg_protect_profile_billing
  before update on public.profiles
  for each row execute procedure public.protect_profile_billing_columns();

-- 4. TABELLA PROJECTS (Progetti di Studio, Lezioni e Mappe Concettuali)
create table if not exists public.projects (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  title text not null default 'Progetto di Studio',
  description text,
  exam_date text,
  prep_level integer default 80,
  exam_type text default 'orale',
  language_style text default 'automatico',
  source_type text default 'my_materials',
  schedule jsonb not null default '[]'::jsonb,
  files jsonb not null default '[]'::jsonb,
  lessons_content jsonb not null default '{}'::jsonb,
  concept_maps jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.projects add column if not exists lessons_content jsonb not null default '{}'::jsonb;
alter table public.projects add column if not exists concept_maps jsonb not null default '[]'::jsonb;
create index if not exists idx_projects_user_id on public.projects(user_id);

-- 5. TABELLA CONVERSATIONS (Chat AI)
create table if not exists public.conversations (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  title text not null default 'Nuova Conversazione',
  messages jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_conversations_user_id on public.conversations(user_id);

-- 6. ROW LEVEL SECURITY (RLS)
alter table public.profiles enable row level security;
alter table public.projects enable row level security;
alter table public.conversations enable row level security;

-- Policies Profiles
drop policy if exists "Users can view own profile" on public.profiles;
create policy "Users can view own profile"
  on public.profiles for select
  using (auth.uid() = id);

drop policy if exists "Users can update own safe profile fields" on public.profiles;
create policy "Users can update own safe profile fields"
  on public.profiles for update
  using (auth.uid() = id)
  with check (auth.uid() = id);

-- Policies Projects
drop policy if exists "Users can manage own projects" on public.projects;
create policy "Users can manage own projects"
  on public.projects for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

-- Policies Conversations
drop policy if exists "Users can manage own conversations" on public.conversations;
create policy "Users can manage own conversations"
  on public.conversations for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);
