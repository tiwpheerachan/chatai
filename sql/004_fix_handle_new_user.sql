-- =============================================================
-- HOTFIX: "Database error saving new user" on signup
-- =============================================================
-- Cause: handle_new_user() ran without an explicit search_path, so the
-- unqualified `profiles` reference could not be resolved inside GoTrue's
-- signup transaction. Fix = schema-qualify + pin search_path.
-- Safe to run multiple times.

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, email, name, role)
  values (
    new.id,
    new.email,
    coalesce(new.raw_user_meta_data->>'name', split_part(new.email, '@', 1)),
    'viewer'
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();
