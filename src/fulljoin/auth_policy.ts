export type AccessControlErrorCode = "authentication_required" | "user_id_mismatch" | "resource_forbidden";

export class AccessControlError extends Error {
  readonly status: 401 | 403;
  readonly code: AccessControlErrorCode;

  constructor(status: 401 | 403, code: AccessControlErrorCode) {
    super(code);
    this.name = "AccessControlError";
    this.status = status;
    this.code = code;
  }
}

// jwtSubject는 Supabase gateway 또는 auth.getUser()가 검증한 sub만 받는다.
// 이 모듈은 전환 정책의 순수 경계이며 현재 데모 API에는 아직 연결하지 않는다.
export function authenticatedUserId(input: {
  jwtSubject: string | null;
  requestedUserId?: string | null;
}): string {
  const jwtSubject = input.jwtSubject?.trim() ?? "";
  if (jwtSubject.length === 0) {
    throw new AccessControlError(401, "authentication_required");
  }
  const requestedUserId = input.requestedUserId?.trim() ?? "";
  if (requestedUserId.length > 0 && requestedUserId !== jwtSubject) {
    throw new AccessControlError(403, "user_id_mismatch");
  }
  return jwtSubject;
}

export function assertResourceOwner(authenticatedId: string, resourceOwnerId: string): void {
  if (authenticatedId !== resourceOwnerId) {
    throw new AccessControlError(403, "resource_forbidden");
  }
}
