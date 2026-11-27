alter table public.notification_dispatch_config
  add column if not exists endpoint_url text;

alter table public.notification_dispatch_config
  drop constraint if exists notification_dispatch_config_endpoint_url_check;

alter table public.notification_dispatch_config
  add constraint notification_dispatch_config_endpoint_url_check check (
    endpoint_url is null
    or endpoint_url ~ '^https://[a-z]{20}\.supabase\.co/functions/v1/notifications/dispatch$'
  );

comment on column public.notification_dispatch_config.endpoint_url is
  'Environment-specific notifications dispatch URL. Cron remains inert until configured.';
