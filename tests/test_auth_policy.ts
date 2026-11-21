import assert from "node:assert/strict";
import test from "node:test";

import {
  AccessControlError,
  assertResourceOwner,
  authenticatedUserId,
} from "../src/fulljoin/auth_policy.ts";

test("verified JWT subject becomes the server-side user id", () => {
  assert.equal(authenticatedUserId({ jwtSubject: "AUTH-A" }), "AUTH-A");
  assert.equal(authenticatedUserId({ jwtSubject: "AUTH-A", requestedUserId: "AUTH-A" }), "AUTH-A");
});

test("missing verified subject is rejected", () => {
  assert.throws(
    () => authenticatedUserId({ jwtSubject: null, requestedUserId: "DEMO-A" }),
    (error) => error instanceof AccessControlError && error.status === 401 && error.code === "authentication_required",
  );
});

test("A JWT cannot select B through a request user_id", () => {
  assert.throws(
    () => authenticatedUserId({ jwtSubject: "AUTH-A", requestedUserId: "AUTH-B" }),
    (error) => error instanceof AccessControlError && error.status === 403 && error.code === "user_id_mismatch",
  );
});

test("A cannot mutate a resource owned by B", () => {
  assert.doesNotThrow(() => assertResourceOwner("AUTH-A", "AUTH-A"));
  assert.throws(
    () => assertResourceOwner("AUTH-A", "AUTH-B"),
    (error) => error instanceof AccessControlError && error.status === 403 && error.code === "resource_forbidden",
  );
});
