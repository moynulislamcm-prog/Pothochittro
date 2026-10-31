-- ============================================================
--  পথচিত্র — Supabase স্কিমা
--  কনটেন্ট (জেলা/উপজেলা/গন্তব্য/সীমানা) + ব্যবহারকারীর ভ্রমণতালিকা
--  + এডমিন প্যানেলের সেটিংস
--
--  নোট: হোটেল / খাবার / দাম / যাতায়াত ভাড়ার কোনো টেবিল নেই।
--        শুধু দূরত্ব রাখা হয়েছে (সেটি ক্লায়েন্ট সাইডে হিসাব হয়)।
-- ============================================================

-- ---------- বিভাগ ----------
create table if not exists public.pc_divisions (
  id          text primary key,
  bn_name     text not null,
  name        text not null,
  sort        integer not null default 0
);

-- ---------- জেলা ----------
create table if not exists public.pc_districts (
  id          text primary key,
  division_id text references public.pc_divisions(id) on delete set null,
  bn_name     text not null,
  name        text not null,
  lat         double precision,
  lon         double precision,
  famous      text not null default '',
  summary     text not null default '',
  is_published boolean not null default true,
  updated_at  timestamptz not null default now()
);

create index if not exists pc_districts_division_idx on public.pc_districts(division_id);

-- ---------- উপজেলা ----------
create table if not exists public.pc_upazilas (
  id          text primary key,
  district_id text not null references public.pc_districts(id) on delete cascade,
  bn_name     text not null,
  name        text not null default ''
);

create index if not exists pc_upazilas_district_idx on public.pc_upazilas(district_id);

-- ---------- গন্তব্য ----------
create table if not exists public.pc_places (
  id              text primary key,
  district_id     text not null references public.pc_districts(id) on delete cascade,
  upazila_id      text references public.pc_upazilas(id) on delete set null,
  upazila_bn      text not null default '',
  name            text not null,
  name_en         text not null default '',
  category        text not null default 'heritage',
  lat             double precision,
  lon             double precision,
  summary         text not null default '',
  description     text not null default '',
  image           text,
  -- কনটেন্ট ও ডেটা-গুণমান কলাম (মাইগ্রেশন pathchitro_place_content_columns)
  slug            text,                      -- /places/:slug রাউট ও canonical URL
  history         text,                      -- বিস্তারিত ইতিহাস; অনুচ্ছেদ খালি লাইনে আলাদা
  how_to_go       text,                      -- কীভাবে যাবেন
  best_time       text,                      -- ভ্রমণের উপযুক্ত সময়
  locality        text,                      -- থানা শহর / জেলা শহর / মফস্বল
  dist_from_hq_km numeric(6,1),              -- জেলা শহর থেকে সরলরেখার দূরত্ব
  coord_source    text,                      -- মূল ডেটা / লেখক / উপজেলা-কেন্দ্র / জেলা-কেন্দ্র
  coord_verified  boolean not null default false,
  verified        boolean not null default true,  -- false মানে কনটেন্ট যাচাই বাকি
  source          text,                      -- মূল / লেখক / মূল+লেখক
  is_published    boolean not null default true,
  updated_at      timestamptz not null default now()
);

create index if not exists pc_places_district_idx on public.pc_places(district_id);
create index if not exists pc_places_category_idx on public.pc_places(category);
create index if not exists pc_places_district_id_idx on public.pc_places(district_id);

-- স্লাগ অনন্য হতে হবে কারণ এটিই /places/:slug রাউট ও canonical URL গঠন করে।
-- আংশিক UNIQUE INDEX ব্যবহার করা হয়েছে যাতে একাধিক NULL অনুমোদিত থাকে —
-- স্লাগ ছাড়া গন্তব্য তৈরি হলে ইনসার্ট ব্যর্থ হবে না, কিন্তু ডুপ্লিকেট স্লাগ
-- কঠোরভাবে ঠেকানো হবে।
create unique index if not exists pc_places_slug_key
  on public.pc_places(slug) where slug is not null;

-- ---------- জেলার সীমানা (GeoJSON) ----------
create table if not exists public.pc_boundaries (
  district_id text primary key references public.pc_districts(id) on delete cascade,
  geojson     jsonb not null,
  updated_at  timestamptz not null default now()
);

-- ---------- প্রোফাইল ও ভূমিকা ----------
create table if not exists public.pc_profiles (
  id           uuid primary key references auth.users(id) on delete cascade,
  display_name text not null default '',
  role         text not null default 'traveler' check (role in ('traveler','admin')),
  created_at   timestamptz not null default now()
);

-- ---------- ঘোরা জেলা / যেতে চাই ----------
create table if not exists public.pc_visited (
  user_id     uuid not null references public.pc_profiles(id) on delete cascade,
  district_id text not null references public.pc_districts(id) on delete cascade,
  status      text not null default 'visited' check (status in ('visited','wishlist')),
  note        text not null default '',
  updated_at  timestamptz not null default now(),
  primary key (user_id, district_id, status)
);

create index if not exists pc_visited_district_idx on public.pc_visited(district_id);

-- ---------- গন্তব্য মার্ক ----------
create table if not exists public.pc_place_marks (
  user_id    uuid not null references public.pc_profiles(id) on delete cascade,
  place_id   text not null references public.pc_places(id) on delete cascade,
  status     text not null default 'visited' check (status in ('visited','wishlist')),
  note       text not null default '',
  updated_at timestamptz not null default now(),
  primary key (user_id, place_id, status)
);

-- ---------- সাইট সেটিংস ----------
create table if not exists public.pc_settings (
  key        text primary key,
  value      jsonb not null,
  updated_at timestamptz not null default now()
);

-- ============================================================
--  ফাংশন
-- ============================================================

create or replace function public.pc_is_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.pc_profiles p
    where p.id = auth.uid() and p.role = 'admin'
  );
$$;

-- নতুন অ্যাকাউন্ট খোলার সাথে সাথে প্রোফাইল তৈরি;
-- admin_emails সেটিংসে থাকা ইমেইল হলে সরাসরি এডমিন ভূমিকা।
create or replace function public.pc_handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_admin_emails jsonb;
  v_email text;
begin
  select value into v_admin_emails from public.pc_settings where key = 'admin_emails';
  select new.email into v_email;

  insert into public.pc_profiles (id, display_name, role)
  values (
    new.id,
    coalesce(new.raw_user_meta_data ->> 'display_name', split_part(new.email, '@', 1)),
    case
      when v_admin_emails is not null
       and jsonb_typeof(v_admin_emails) = 'array'
       and to_jsonb(lower(new.email)) <@ (
             select jsonb_agg(lower(x)) from jsonb_array_elements_text(v_admin_emails) x
           )
      then 'admin'
      else 'traveler'
    end
  )
  on conflict (id) do nothing;

  return new;
end;
$$;

drop trigger if exists pc_on_auth_user_created on auth.users;
create trigger pc_on_auth_user_created
  after insert on auth.users
  for each row execute function public.pc_handle_new_user();

-- ============================================================
--  RLS
-- ============================================================

alter table public.pc_divisions   enable row level security;
alter table public.pc_districts   enable row level security;
alter table public.pc_upazilas    enable row level security;
alter table public.pc_places      enable row level security;
alter table public.pc_boundaries  enable row level security;
alter table public.pc_profiles    enable row level security;
alter table public.pc_visited     enable row level security;
alter table public.pc_place_marks enable row level security;
alter table public.pc_settings    enable row level security;

-- কনটেন্ট: সবাই পড়তে পারবে (শুধু প্রকাশিত), লিখতে পারবে শুধু এডমিন
drop policy if exists pc_content_read on public.pc_divisions;
create policy pc_content_read on public.pc_divisions for select using (true);

drop policy if exists pc_district_read on public.pc_districts;
create policy pc_district_read on public.pc_districts
  for select using (is_published or public.pc_is_admin());

drop policy if exists pc_upazila_read on public.pc_upazilas;
create policy pc_upazila_read on public.pc_upazilas for select using (true);

drop policy if exists pc_place_read on public.pc_places;
create policy pc_place_read on public.pc_places
  for select using (is_published or public.pc_is_admin());

drop policy if exists pc_boundary_read on public.pc_boundaries;
create policy pc_boundary_read on public.pc_boundaries for select using (true);

drop policy if exists pc_content_admin_write on public.pc_divisions;
create policy pc_content_admin_write on public.pc_divisions
  for all using (public.pc_is_admin()) with check (public.pc_is_admin());

drop policy if exists pc_district_admin_write on public.pc_districts;
create policy pc_district_admin_write on public.pc_districts
  for all using (public.pc_is_admin()) with check (public.pc_is_admin());

drop policy if exists pc_upazila_admin_write on public.pc_upazilas;
create policy pc_upazila_admin_write on public.pc_upazilas
  for all using (public.pc_is_admin()) with check (public.pc_is_admin());

drop policy if exists pc_place_admin_write on public.pc_places;
create policy pc_place_admin_write on public.pc_places
  for all using (public.pc_is_admin()) with check (public.pc_is_admin());

drop policy if exists pc_boundary_admin_write on public.pc_boundaries;
create policy pc_boundary_admin_write on public.pc_boundaries
  for all using (public.pc_is_admin()) with check (public.pc_is_admin());

-- প্রোফাইল: নিজেরটা নিজে, এডমিন সবারটা
drop policy if exists pc_profile_self on public.pc_profiles;
create policy pc_profile_self on public.pc_profiles
  for select using (id = auth.uid() or public.pc_is_admin());

drop policy if exists pc_profile_self_update on public.pc_profiles;
create policy pc_profile_self_update on public.pc_profiles
  for update using (id = auth.uid()) with check (id = auth.uid());

drop policy if exists pc_profile_admin_manage on public.pc_profiles;
create policy pc_profile_admin_manage on public.pc_profiles
  for all using (public.pc_is_admin()) with check (public.pc_is_admin());

-- ভ্রমণতালিকা: নিজেরটা নিজে, এডমিন সব দেখতে পারবে
drop policy if exists pc_visited_own on public.pc_visited;
create policy pc_visited_own on public.pc_visited
  for select using (user_id = auth.uid() or public.pc_is_admin());

drop policy if exists pc_visited_write on public.pc_visited;
create policy pc_visited_write on public.pc_visited
  for all using (user_id = auth.uid()) with check (user_id = auth.uid());

drop policy if exists pc_place_marks_own on public.pc_place_marks;
create policy pc_place_marks_own on public.pc_place_marks
  for select using (user_id = auth.uid() or public.pc_is_admin());

drop policy if exists pc_place_marks_write on public.pc_place_marks;
create policy pc_place_marks_write on public.pc_place_marks
  for all using (user_id = auth.uid()) with check (user_id = auth.uid());

-- সেটিংস: সবাই পড়তে পারবে (admin_emails ছাড়া), লিখবে শুধু এডমিন
drop policy if exists pc_settings_read on public.pc_settings;
create policy pc_settings_read on public.pc_settings
  for select using (key <> 'admin_emails' or public.pc_is_admin());

drop policy if exists pc_settings_admin_write on public.pc_settings;
create policy pc_settings_admin_write on public.pc_settings
  for all using (public.pc_is_admin()) with check (public.pc_is_admin());

-- ============================================================
--  প্রাথমিক সেটিংস
-- ============================================================
insert into public.pc_settings (key, value) values
  ('site', '{"title":"পথচিত্র","tagline":"বাংলাদেশ, আপনার পথে","updatedLabel":"তথ্য হালনাগাদ: অক্টোবর ২০২৬"}'::jsonb),
  ('admin_emails', '[]'::jsonb)
on conflict (key) do nothing;
