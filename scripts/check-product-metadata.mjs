import assert from "node:assert/strict";

import { extractProductMetadata } from "../src/fulljoin/product_metadata.ts";

const jsonLd = `
  <html><head>
  <meta property="og:site_name" content="예시 쇼핑몰">
  <script type="application/ld+json">
    {"@context":"https://schema.org","@type":"Product","name":"브라운 &amp; 코트","brand":{"@type":"Brand","name":"FULL JOIN"}}
  </script></head></html>`;
assert.deepEqual(extractProductMetadata(jsonLd, "https://shop.example/products/1"), {
  shop: "예시 쇼핑몰",
  brand: "FULL JOIN",
  product_name: "브라운 & 코트",
});

const openGraph = `<meta content='ZIGZAG' property='og:site_name'><meta name="twitter:title" content="트위드 재킷 &quot;블랙&quot;">`;
assert.deepEqual(extractProductMetadata(openGraph, "https://zigzag.kr/catalog/products/1"), {
  shop: "ZIGZAG",
  brand: null,
  product_name: '트위드 재킷 "블랙"',
});

const fallback = `<script type="application/ld+json">not json</script><title>상품 페이지</title>`;
assert.deepEqual(extractProductMetadata(fallback, "https://www.example.com/item"), {
  shop: "example.com",
  brand: null,
  product_name: "상품 페이지",
});

console.log("Product metadata extraction checks passed.");
