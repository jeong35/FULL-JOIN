import assert from "node:assert/strict";
import test from "node:test";

import {
  authorizeRequestedUsers,
  bearerToken,
  requestedUserIds,
  userRouteRequiresAuth,
} from "../src/fulljoin/api_auth.ts";
import { AccessControlError } from "../src/fulljoin/auth_policy.ts";

test("user routes require auth while public and admin routes keep their own boundary", () => {
  assert.equal(userRouteRequiresAuth("/wardrobe", "GET"), true);
  assert.equal(userRouteRequiresAuth("/wardrobe/item-a/photo", "PUT"), true);
  assert.equal(userRouteRequiresAuth("/style-images/image-a/heart", "POST"), true);
  assert.equal(userRouteRequiresAuth("/style-images/image-a/items/item-a/decision", "POST"), true);
  assert.equal(userRouteRequiresAuth("/weather", "GET"), true);
  assert.equal(userRouteRequiresAuth("/health", "GET"), false);
  assert.equal(userRouteRequiresAuth("/analyze", "POST"), false);
  assert.equal(userRouteRequiresAuth("/style-images/image-a", "GET"), false);
  assert.equal(userRouteRequiresAuth("/wardrobe", "OPTIONS"), false);
});

test("bearer parsing rejects ambiguous authorization headers", () => {
  assert.equal(bearerToken("Bearer jwt-token"), "jwt-token");
  assert.equal(bearerToken("bearer jwt-token"), "jwt-token");
  assert.equal(bearerToken("Basic abc"), null);
  assert.equal(bearerToken("Bearer one two"), null);
  assert.equal(bearerToken(null), null);
});

test("query, body and event user ids are collected without trusting duplicates", () => {
  assert.deepEqual(requestedUserIds({ path: "/wardrobe", method: "GET", queryUserId: " AUTH-A " }), ["AUTH-A"]);
  assert.deepEqual(requestedUserIds({
    path: "/events",
    method: "POST",
    body: { events: [{ user_id: "AUTH-A" }, { user_id: null }, { user_id: "AUTH-A" }] },
  }), ["AUTH-A"]);
  assert.deepEqual(requestedUserIds({ path: "/weather", method: "GET" }), []);
});

test("JWT subject is authoritative for every requested user id", () => {
  assert.equal(authorizeRequestedUsers("AUTH-A", []), "AUTH-A");
  assert.equal(authorizeRequestedUsers("AUTH-A", ["AUTH-A", "AUTH-A"]), "AUTH-A");
  assert.throws(
    () => authorizeRequestedUsers("AUTH-A", ["AUTH-B"]),
    (error) => error instanceof AccessControlError && error.status === 403 && error.code === "user_id_mismatch",
  );
  assert.throws(
    () => authorizeRequestedUsers(null, []),
    (error) => error instanceof AccessControlError && error.status === 401 && error.code === "authentication_required",
  );
});
