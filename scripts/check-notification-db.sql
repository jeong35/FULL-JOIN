begin;
do $$
declare s uuid; token uuid := gen_random_uuid(); n integer;
begin
  insert into notification_subscriptions(user_id,endpoint,p256dh,auth,access_token)
    values('smoke-notification-db','https://fcm.googleapis.com/synthetic-db-test','test','test',token) returning id into s;
  perform replace_notification_schedule('smoke-notification-db',s,token,'look',now()+interval '1 day','Asia/Seoul');
  perform replace_notification_schedule('smoke-notification-db',s,token,'look',now()+interval '1 day 1 hour','Asia/Seoul');
  select count(*) into n from notification_schedules where user_id='smoke-notification-db' and status='pending';
  if n <> 1 then raise exception 'duplicate pending schedule'; end if;
  begin
    perform replace_notification_schedule('smoke-notification-db',s,gen_random_uuid(),'look',now()+interval '1 day','Asia/Seoul');
    raise exception 'unexpected authorization success';
  exception when others then
    if sqlerrm <> 'subscription_not_found' then raise; end if;
  end;
  update notification_schedules set status='cancelled' where user_id='smoke-notification-db' and status in ('pending','sending');
  select count(*) into n from notification_schedules where user_id='smoke-notification-db' and status='pending';
  if n <> 0 then raise exception 'cancellation failed'; end if;
end $$;
rollback;
