-- Pin search_path on set_push_tokens_updated_at() (#543).
--
-- set_push_tokens_updated_at() (20260705000003_push_tokens.sql) was the one trigger
-- function in the chain created without a pinned search_path. Every other function pins
-- `set search_path = ''` (the convention the #334 migration enforced) so a definer's
-- privileges can't be redirected via a spoofed search_path. This one is SECURITY INVOKER
-- and only assigns new.updated_at, so exposure is minimal — but pinning it removes the
-- exception and clears the advisor's 0011_function_search_path_mutable warning.
--
-- create or replace keeps the existing push_tokens_set_updated_at trigger bound to the
-- function; only the function body/attributes change. Body is otherwise unchanged.
create or replace function set_push_tokens_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;
