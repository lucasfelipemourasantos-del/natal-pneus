create type public.app_role as enum ('admin', 'employee');
create type public.access_status as enum ('pending', 'approved', 'suspended');

create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  email text not null,
  full_name text not null default '',
  internal_id text,
  job_role text,
  unit text,
  admission_date date,
  status public.access_status not null default 'pending',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.user_roles (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete cascade not null,
  role public.app_role not null,
  unique (user_id, role)
);

grant select, update on public.profiles to authenticated;
grant all on public.profiles to service_role;
grant select on public.user_roles to authenticated;
grant all on public.user_roles to service_role;

alter table public.profiles enable row level security;
alter table public.user_roles enable row level security;

create or replace function public.has_role(_user_id uuid, _role public.app_role)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.user_roles where user_id = _user_id and role = _role)
$$;

create policy "Own profile readable" on public.profiles for select to authenticated
  using (auth.uid() = id or public.has_role(auth.uid(), 'admin'));
create policy "Admins update profiles" on public.profiles for update to authenticated
  using (public.has_role(auth.uid(), 'admin')) with check (public.has_role(auth.uid(), 'admin'));

create policy "Own roles readable" on public.user_roles for select to authenticated
  using (auth.uid() = user_id or public.has_role(auth.uid(), 'admin'));

create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  first_admin boolean;
begin
  select not exists (select 1 from public.user_roles where role = 'admin') into first_admin;
  insert into public.profiles (id, email, full_name, internal_id, job_role, unit, admission_date, status)
  values (
    new.id, new.email,
    coalesce(new.raw_user_meta_data->>'full_name', ''),
    nullif(new.raw_user_meta_data->>'internal_id', ''),
    nullif(new.raw_user_meta_data->>'job_role', ''),
    nullif(new.raw_user_meta_data->>'unit', ''),
    nullif(new.raw_user_meta_data->>'admission_date', '')::date,
    case when first_admin then 'approved'::public.access_status else 'pending'::public.access_status end
  );
  insert into public.user_roles (user_id, role)
  values (new.id, case when first_admin then 'admin'::public.app_role else 'employee'::public.app_role end);
  return new;
end;
$$;

create trigger on_auth_user_created after insert on auth.users
  for each row execute function public.handle_new_user();

create or replace function public.touch_updated_at()
returns trigger language plpgsql set search_path = public as $$
begin new.updated_at = now(); return new; end; $$;
create trigger profiles_touch before update on public.profiles
  for each row execute function public.touch_updated_at();