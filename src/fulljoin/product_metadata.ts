export type ProductMetadata = {
  shop: string | null;
  brand: string | null;
  product_name: string | null;
};

const HTML_ENTITIES: Record<string, string> = {
  amp: "&",
  apos: "'",
  gt: ">",
  lt: "<",
  nbsp: " ",
  quot: '"',
};

function decodeHtml(value: string): string {
  return value.replace(/&(#x[0-9a-f]+|#[0-9]+|[a-z]+);/gi, (match, entity: string) => {
    if (entity.startsWith("#x")) return String.fromCodePoint(Number.parseInt(entity.slice(2), 16));
    if (entity.startsWith("#")) return String.fromCodePoint(Number.parseInt(entity.slice(1), 10));
    return HTML_ENTITIES[entity.toLowerCase()] ?? match;
  });
}

function cleanText(value: unknown, maxLength = 300): string | null {
  if (typeof value !== "string") return null;
  const cleaned = decodeHtml(value).replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim();
  return cleaned.length === 0 ? null : cleaned.slice(0, maxLength);
}

function tagAttributes(tag: string): Record<string, string> {
  const attributes: Record<string, string> = {};
  const pattern = /([^\s=/>]+)\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'=<>`]+))/g;
  for (const match of tag.matchAll(pattern)) {
    const name = match[1]?.toLowerCase();
    const value = match[2] ?? match[3] ?? match[4];
    if (name !== undefined && value !== undefined) attributes[name] = value;
  }
  return attributes;
}

function metaValues(html: string): Map<string, string> {
  const values = new Map<string, string>();
  for (const match of html.matchAll(/<meta\b[^>]*>/gi)) {
    const attributes = tagAttributes(match[0]);
    const key = (attributes.property ?? attributes.name)?.toLowerCase();
    if (key && attributes.content && !values.has(key)) values.set(key, attributes.content);
  }
  return values;
}

function jsonLdObjects(value: unknown): Record<string, unknown>[] {
  if (Array.isArray(value)) return value.flatMap(jsonLdObjects);
  if (typeof value !== "object" || value === null) return [];
  const object = value as Record<string, unknown>;
  return [object, ...jsonLdObjects(object["@graph"]), ...jsonLdObjects(object.mainEntity)];
}

function productFromJsonLd(html: string): Record<string, unknown> | null {
  for (const match of html.matchAll(/<script\b[^>]*type\s*=\s*["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi)) {
    try {
      const parsed: unknown = JSON.parse(decodeHtml(match[1] ?? ""));
      const product = jsonLdObjects(parsed).find((object) => {
        const type = object["@type"];
        return type === "Product" || (Array.isArray(type) && type.includes("Product"));
      });
      if (product !== undefined) return product;
    } catch {
      // Invalid third-party JSON-LD is ignored; Open Graph remains available.
    }
  }
  return null;
}

function brandName(product: Record<string, unknown> | null): string | null {
  if (product === null) return null;
  const brand = product.brand ?? product.manufacturer;
  if (typeof brand === "string") return cleanText(brand, 200);
  if (typeof brand === "object" && brand !== null) return cleanText((brand as Record<string, unknown>).name, 200);
  return null;
}

export function extractProductMetadata(html: string, pageUrl: string): ProductMetadata {
  const metadata = metaValues(html);
  const product = productFromJsonLd(html);
  const titleMatch = html.match(/<title\b[^>]*>([\s\S]*?)<\/title>/i);
  const hostname = new URL(pageUrl).hostname.replace(/^www\./, "");
  return {
    shop: cleanText(metadata.get("og:site_name"), 200) ?? hostname,
    brand: brandName(product) ?? cleanText(metadata.get("product:brand"), 200),
    product_name: cleanText(product?.name, 300) ?? cleanText(metadata.get("og:title") ?? metadata.get("twitter:title") ?? titleMatch?.[1], 300),
  };
}
