-- Users profile table (Supabase Auth handles passwords/sessions)
create table public.users (
  id uuid primary key references auth.users(id) on delete cascade,
  username text unique not null,
  email text unique not null,
  name text not null,
  organisation text,
  phone text,
  role text not null default 'booker' check (role in ('admin', 'controller', 'booker')),
  contact_preference text not null default 'both' check (contact_preference in ('email', 'notification', 'both')),
  created_at timestamptz default now()
);
-- Note: role is stored here AND synced to auth.users.app_metadata.role by Edge Functions
-- so RLS policies can read it from the JWT without querying this table.

create table public.facilities (
  id serial primary key,
  name text not null,
  description text,
  type text not null check (type in ('room', 'equipment', 'service')),
  capacity integer,
  is_whole_hall boolean default false,
  active boolean default true,
  color text,
  created_at timestamptz default now()
);

create table public.bookings (
  id serial primary key,
  facility_id integer not null references public.facilities(id),
  booker_id uuid not null,
  date date not null,
  start_time text not null,
  duration_slots integer not null,
  status text not null default 'pending' check (status in ('pending', 'approved', 'denied')),
  notes text,
  controller_id uuid,
  controller_notes text,
  created_at timestamptz default now(),
  updated_at timestamptz default now(),
  constraint fk_bookings_booker foreign key (booker_id) references public.users(id),
  constraint fk_bookings_controller foreign key (controller_id) references public.users(id)
);

create table public.notifications (
  id serial primary key,
  user_id uuid not null references public.users(id) on delete cascade,
  booking_id integer references public.bookings(id) on delete cascade,
  message text not null,
  type text not null check (type in ('booking_request', 'booking_approved', 'booking_denied')),
  read boolean default false,
  created_at timestamptz default now()
);

-- Read role from JWT app_metadata (set by admin-user Edge Function)
create or replace function public.current_user_role()
returns text
language sql
stable
as $$
  select coalesce(
    (auth.jwt() -> 'app_metadata' ->> 'role'),
    'booker'
  )
$$;

-- Auto-update updated_at on bookings
create or replace function public.update_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

create trigger bookings_updated_at
  before update on public.bookings
  for each row execute procedure public.update_updated_at();

-- Enable RLS
alter table public.users enable row level security;
alter table public.facilities enable row level security;
alter table public.bookings enable row level security;
alter table public.notifications enable row level security;

-- USERS: own profile, or admin/controller sees all
create policy "users_select" on public.users
  for select
  using (id = auth.uid() or current_user_role() in ('admin', 'controller'));

create policy "users_update_own" on public.users
  for update
  using (id = auth.uid())
  with check (id = auth.uid());

-- INSERT/DELETE handled by admin-user Edge Function (service role bypasses RLS)

-- FACILITIES: all authenticated can read; admin manages
create policy "facilities_select" on public.facilities
  for select
  using (auth.uid() is not null);

create policy "facilities_insert" on public.facilities
  for insert
  with check (current_user_role() = 'admin');

create policy "facilities_update" on public.facilities
  for update
  using (current_user_role() = 'admin');

create policy "facilities_delete" on public.facilities
  for delete
  using (current_user_role() = 'admin');

-- BOOKINGS: all authenticated can read; own pending or admin/controller can mutate
create policy "bookings_select" on public.bookings
  for select
  using (auth.uid() is not null);

-- INSERT handled by create-booking Edge Function (service role)

create policy "bookings_update" on public.bookings
  for update
  using (
    (booker_id = auth.uid() and status = 'pending') or
    current_user_role() in ('admin', 'controller')
  );

create policy "bookings_delete" on public.bookings
  for delete
  using (
    (booker_id = auth.uid() and status = 'pending') or
    current_user_role() in ('admin', 'controller')
  );

-- NOTIFICATIONS: own only
create policy "notifications_select" on public.notifications
  for select
  using (user_id = auth.uid());

create policy "notifications_update" on public.notifications
  for update
  using (user_id = auth.uid())
  with check (user_id = auth.uid());
