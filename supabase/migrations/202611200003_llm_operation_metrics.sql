create table if not exists public.llm_operation_metrics (
  id uuid primary key default gen_random_uuid(),
  feature text not null check (char_length(feature) between 1 and 64),
  response_mode text not null check (response_mode in ('llm', 'grounded', 'fallback')),
  llm_called boolean not null,
  model text check (model is null or char_length(model) between 1 and 120),
  prompt_version text not null check (char_length(prompt_version) between 1 and 80),
  release_git_sha text check (release_git_sha is null or release_git_sha ~ '^[0-9a-f]{7,64}$'),
  status text not null check (status in ('success', 'failure', 'fallback', 'grounded')),
  error_type text check (error_type is null or error_type in (
    'configuration', 'timeout', 'http_error', 'refusal', 'invalid_output', 'unknown'
  )),
  http_status integer check (http_status is null or http_status between 100 and 599),
  input_tokens integer not null default 0 check (input_tokens >= 0),
  cached_input_tokens integer not null default 0 check (
    cached_input_tokens >= 0 and cached_input_tokens <= input_tokens
  ),
  output_tokens integer not null default 0 check (output_tokens >= 0),
  pricing_version text check (pricing_version is null or char_length(pricing_version) between 1 and 80),
  estimated_cost_usd numeric(14, 8) check (estimated_cost_usd is null or estimated_cost_usd >= 0),
  latency_ms integer not null check (latency_ms >= 0),
  fallback_used boolean not null default false,
  fallback_reason text check (fallback_reason is null or fallback_reason in (
    'model_unavailable', 'timeout', 'invalid_output', 'configuration', 'unknown'
  )),
  created_at timestamptz not null default now(),
  constraint llm_operation_metrics_grounded_shape check (
    response_mode <> 'grounded' or (
      llm_called = false and model is null and input_tokens = 0 and
      cached_input_tokens = 0 and output_tokens = 0 and estimated_cost_usd is null
    )
  )
);

comment on table public.llm_operation_metrics is
  'Privacy-minimized LLM operations. Never store prompts, chat/image content, URLs, or raw user identifiers.';
comment on column public.llm_operation_metrics.feature is
  'Extensible feature key: style_tagging, chat, wardrobe_photo_tagging, image_enhancement, etc.';

create index if not exists llm_operation_metrics_created_at_idx
  on public.llm_operation_metrics (created_at desc);
create index if not exists llm_operation_metrics_feature_release_idx
  on public.llm_operation_metrics (feature, release_git_sha, created_at desc);

alter table public.llm_operation_metrics enable row level security;
revoke all on table public.llm_operation_metrics from anon, authenticated;
grant select, insert on table public.llm_operation_metrics to service_role;
