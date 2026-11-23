import assert from "node:assert/strict";
import test from "node:test";

import {
  decodedDataUrlBytes,
  wardrobePhotoPath,
  wardrobePhotoTagSchema,
} from "../src/fulljoin/wardrobe_photo.ts";

test("photo paths are deterministically scoped to the authenticated owner", () => {
  assert.equal(
    wardrobePhotoPath("11111111-1111-4111-8111-111111111111", "22222222-2222-4222-8222-222222222222"),
    "11111111-1111-4111-8111-111111111111/22222222-2222-4222-8222-222222222222.png",
  );
  assert.throws(() => wardrobePhotoPath("someone-else", "22222222-2222-4222-8222-222222222222"));
});

test("photo tag accepts catalog combinations and rejects slot/kind or fit mismatches", () => {
  assert.equal(wardrobePhotoTagSchema.safeParse({ slot: "상의", kind: "니트", color: "아이보리", visual_fit: "레귤러" }).success, true);
  assert.equal(wardrobePhotoTagSchema.safeParse({ slot: "신발", kind: "니트", color: "아이보리", visual_fit: null }).success, false);
  assert.equal(wardrobePhotoTagSchema.safeParse({ slot: "신발", kind: "스니커즈", color: "화이트", visual_fit: "레귤러" }).success, false);
});

test("data URL byte calculation handles base64 padding", () => {
  assert.equal(decodedDataUrlBytes("data:image/png;base64,AA=="), 1);
  assert.equal(decodedDataUrlBytes("data:image/png;base64,AAA="), 2);
  assert.equal(decodedDataUrlBytes("data:image/png;base64,AAAA"), 3);
});
