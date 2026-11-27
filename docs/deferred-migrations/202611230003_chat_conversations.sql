-- CHAT-02: authenticated, photo-scoped conversation persistence.
-- 202611230002 is reserved by the photo wardrobe branch; keep this migration collision-free.

create table public.chat_conversations (
  id uuid primary key default gen_random_uuid(),
  user_id text not null,
  style_image_id text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, style_image_id),
  foreign key (user_id, style_image_id)
    references public.hearts (user_id, style_image_id)
    on delete cascade
);

create index chat_conversations_user_updated_idx
  on public.chat_conversations (user_id, updated_at desc, id);

create table public.chat_messages (
  id uuid primary key default gen_random_uuid(),
  ordinal bigint generated always as identity unique,
  conversation_id uuid not null references public.chat_conversations(id) on delete cascade,
  user_id text not null,
  role text not null check (role = any (array['user', 'assistant'])),
  content text not null check (char_length(content) between 1 and 4000),
  products jsonb not null default '[]'::jsonb check (
    jsonb_typeof(products) = 'array' and jsonb_array_length(products) <= 20
  ),
  answer_source text check (answer_source is null or answer_source = any (array['grounded', 'openai', 'fallback'])),
  created_at timestamptz not null default now()
);

create index chat_messages_conversation_ordinal_idx
  on public.chat_messages (conversation_id, ordinal desc);

alter table public.chat_conversations enable row level security;
alter table public.chat_messages enable row level security;

grant select, delete on table public.chat_conversations to authenticated;
grant select on table public.chat_messages to authenticated;

create policy chat_conversations_owner_select
on public.chat_conversations
for select
to authenticated
using (auth.uid()::text = user_id);

create policy chat_conversations_owner_delete
on public.chat_conversations
for delete
to authenticated
using (auth.uid()::text = user_id);

create policy chat_messages_owner_select
on public.chat_messages
for select
to authenticated
using (auth.uid()::text = user_id);

create or replace function public.append_chat_exchange(
  p_user_id text,
  p_style_image_id text,
  p_user_content text,
  p_assistant_content text,
  p_products jsonb,
  p_answer_source text
)
returns uuid
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_conversation_id uuid;
begin
  if auth.role() <> 'service_role' then
    raise exception 'service_role_required';
  end if;

  if char_length(p_user_content) not between 1 and 500
    or char_length(p_assistant_content) not between 1 and 4000
    or jsonb_typeof(p_products) <> 'array'
    or jsonb_array_length(p_products) > 20
    or p_answer_source <> all (array['grounded', 'openai', 'fallback']) then
    raise exception 'invalid_chat_exchange';
  end if;

  insert into public.chat_conversations (user_id, style_image_id)
  values (p_user_id, p_style_image_id)
  on conflict (user_id, style_image_id)
  do update set updated_at = now()
  returning id into v_conversation_id;

  insert into public.chat_messages (
    conversation_id,
    user_id,
    role,
    content,
    products,
    answer_source
  ) values
    (v_conversation_id, p_user_id, 'user', p_user_content, '[]'::jsonb, null),
    (v_conversation_id, p_user_id, 'assistant', p_assistant_content, p_products, p_answer_source);

  return v_conversation_id;
end;
$$;

revoke all on function public.append_chat_exchange(text, text, text, text, jsonb, text)
  from public, anon, authenticated;
grant execute on function public.append_chat_exchange(text, text, text, text, jsonb, text)
  to service_role;

comment on table public.chat_conversations is
  'One authenticated conversation per saved style image. Retention duration is intentionally not automated until product policy is approved.';
comment on table public.chat_messages is
  'Private conversation content. It is never copied into llm_operation_metrics.';
