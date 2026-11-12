-- 具身红黑榜：匿名评价表
-- 在 Supabase Dashboard -> SQL Editor 中执行一次。

create extension if not exists pgcrypto;

create table if not exists public.reviews (
  id uuid primary key default gen_random_uuid(),
  company_name text not null,
  type text not null,
  salary smallint not null,
  atmosphere smallint not null,
  growth smallint not null,
  reason text not null,
  role text,
  tenure text,
  location text,
  author text not null default '匿名',
  created_at timestamptz not null default now(),
  published boolean not null default true,
  constraint reviews_company_name_length check (char_length(company_name) between 1 and 100),
  constraint reviews_type_check check (type in ('good', 'neutral', 'bad')),
  constraint reviews_salary_check check (salary between 1 and 5),
  constraint reviews_atmosphere_check check (atmosphere between 1 and 5),
  constraint reviews_growth_check check (growth between 1 and 5),
  constraint reviews_reason_length check (char_length(reason) >= 1)
);

create index if not exists reviews_created_at_idx on public.reviews (created_at desc);

alter table public.reviews enable row level security;

create policy "公开读取已发布评价"
  on public.reviews
  for select
  to anon, authenticated
  using (published = true);

create policy "匿名提交评价"
  on public.reviews
  for insert
  to anon, authenticated
  with check (
    published = true
    and char_length(company_name) between 1 and 100
    and type in ('good', 'neutral', 'bad')
    and salary between 1 and 5
    and atmosphere between 1 and 5
    and growth between 1 and 5
    and char_length(reason) >= 1
  );

grant usage on schema public to anon, authenticated;
grant select, insert on public.reviews to anon, authenticated;

-- 不创建 update / delete 策略：
-- 匿名用户只能提交和读取，不能修改或删除已有评价。
