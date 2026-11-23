import { authenticatedUserId } from "./auth_policy.ts";

export type ApiMethod = "GET" | "POST" | "PUT" | "DELETE" | "OPTIONS";

const USER_ROUTE_PATTERNS: readonly RegExp[] = [
  /^\/wardrobe(?:\/[^/]+)?$/,
  /^\/style-preferences$/,
  /^\/feed$/,
  /^\/archive$/,
  /^\/chat(?:\/history)?$/,
  /^\/events$/,
  /^\/weather$/,
  /^\/style-images\/[^/]+\/heart$/,
  /^\/style-images\/[^/]+\/items\/[^/]+\/decision$/,
];

export function userRouteRequiresAuth(path: string, method: string): boolean {
  if (method === "OPTIONS") return false;
  return USER_ROUTE_PATTERNS.some((pattern) => pattern.test(path));
}

export function bearerToken(authorization: string | null): string | null {
  if (authorization === null) return null;
  const match = /^Bearer\s+([^\s]+)$/i.exec(authorization.trim());
  return match?.[1] ?? null;
}

function bodyUserIds(body: unknown): string[] {
  if (typeof body !== "object" || body === null || Array.isArray(body)) return [];
  const record = body as Record<string, unknown>;
  const ids: string[] = [];
  if (typeof record.user_id === "string" && record.user_id.trim() !== "") ids.push(record.user_id.trim());
  if (Array.isArray(record.events)) {
    for (const event of record.events) {
      if (typeof event !== "object" || event === null || Array.isArray(event)) continue;
      const userId = (event as Record<string, unknown>).user_id;
      if (typeof userId === "string" && userId.trim() !== "") ids.push(userId.trim());
    }
  }
  return [...new Set(ids)];
}

export function requestedUserIds(input: {
  path: string;
  method: string;
  queryUserId?: string | null;
  body?: unknown;
}): string[] {
  const ids = bodyUserIds(input.body);
  if (["GET"].includes(input.method) && ["/wardrobe", "/style-preferences", "/feed", "/archive"].includes(input.path)) {
    const queryUserId = input.queryUserId?.trim() ?? "";
    if (queryUserId !== "") ids.push(queryUserId);
  }
  return [...new Set(ids)];
}

export function authorizeRequestedUsers(jwtSubject: string | null, requestedIds: readonly string[]): string {
  const authenticatedId = authenticatedUserId({ jwtSubject });
  for (const requestedUserId of requestedIds) {
    authenticatedUserId({ jwtSubject: authenticatedId, requestedUserId });
  }
  return authenticatedId;
}
