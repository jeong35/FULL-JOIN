import { track } from './events';

const completed = new Set<string>();

export function completeChatAction(
  actionId: string | string[] | undefined,
  actionType: string | string[] | undefined,
  targetScreen: string,
  extra: Record<string, string | number | boolean | null> = {},
): void {
  const id = Array.isArray(actionId) ? actionId[0] : actionId;
  const type = Array.isArray(actionType) ? actionType[0] : actionType;
  if (typeof id !== 'string' || !/^[0-9a-f-]{36}$/i.test(id) || completed.has(id)) return;
  completed.add(id);
  track('chat_action_completed', {
    action_id: id,
    action_type: typeof type === 'string' ? type : 'unknown',
    target_screen: targetScreen,
    success: true,
    ...extra,
  });
}
