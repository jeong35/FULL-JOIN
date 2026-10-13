import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

type JsonObject = Record<string, unknown>;

type ContractCase = {
  name: string;
  ac: string[];
  feature: string;
  input: JsonObject;
  judge: JsonObject & { type: string };
  pass_output: JsonObject;
  fail_output: JsonObject;
  note: string;
};

type ContractFile = {
  cases: ContractCase[];
};

type GapCase = {
  name: string;
  ac: string[];
};

type GapFile = {
  cases: GapCase[];
};

const contractPath = new URL("./harness/product_golden_cases.yaml", import.meta.url);
const gapPath = new URL("./harness/golden_cases.yaml", import.meta.url);
const specPath = new URL("../docs/SPEC.md", import.meta.url);
const schemaPath = new URL("../src/fulljoin/schemas/style_image.schema.json", import.meta.url);

const [contractText, gapText, specText, schemaText] = await Promise.all([
  readFile(contractPath, "utf8"),
  readFile(gapPath, "utf8"),
  readFile(specPath, "utf8"),
  readFile(schemaPath, "utf8"),
]);

const contracts = JSON.parse(contractText) as ContractFile;
const gapCases = JSON.parse(gapText) as GapFile;
const styleImageSchema = JSON.parse(schemaText) as JsonObject;

function valueAtPath(value: JsonObject, path: string): unknown {
  return path.split(".").reduce<unknown>((current, part) => {
    if (typeof current !== "object" || current === null || Array.isArray(current)) {
      return undefined;
    }
    return (current as JsonObject)[part];
  }, value);
}

function asObject(value: unknown, label: string): JsonObject {
  assert.ok(typeof value === "object" && value !== null && !Array.isArray(value), `${label} must be an object`);
  return value as JsonObject;
}

function asStringArray(value: unknown, label: string): string[] {
  assert.ok(Array.isArray(value) && value.every((entry) => typeof entry === "string"), `${label} must be string[]`);
  return value;
}

function productIdentityIsGrounded(input: JsonObject, output: JsonObject): boolean {
  if (input.has_product_evidence === true) return true;
  return (
    output.brand_source === "없음" &&
    output.brand === null &&
    output.product_name === null &&
    output.match_type === "similar"
  );
}

function enumValues(field: string): unknown[] {
  if (field === "style") {
    const properties = asObject(styleImageSchema.properties, "schema.properties");
    const style = asObject(properties.style, "schema.properties.style");
    const items = asObject(style.items, "schema.properties.style.items");
    assert.ok(Array.isArray(items.enum), "style enum must be an array");
    return items.enum;
  }

  const definitions = asObject(styleImageSchema.$defs, "schema.$defs");
  const itemDefinition = asObject(definitions.Item, "schema.$defs.Item");
  const properties = asObject(itemDefinition.properties, "schema.$defs.Item.properties");
  const property = asObject(properties[field], `schema Item.${field}`);
  assert.ok(Array.isArray(property.enum), `${field} enum must be an array`);
  return property.enum;
}

function usesOnlySchemaEnums(entry: ContractCase, output: JsonObject): boolean {
  const analysis = asObject(output.analysis, "analysis");
  const styles = analysis.style;
  const analysisItems = analysis.items;
  const wardrobeItems = output.wardrobe_items;
  const sharedFields = asStringArray(entry.input.shared_fields, "shared_fields");

  if (!Array.isArray(styles) || !Array.isArray(analysisItems) || !Array.isArray(wardrobeItems)) {
    return false;
  }

  const allowedStyles = enumValues("style");
  if (!styles.every((style) => allowedStyles.includes(style))) return false;

  const records = [...analysisItems, ...wardrobeItems].map((item) => asObject(item, "garment item"));
  return sharedFields.every((field) => {
    const allowed = enumValues(field);
    return records.every((record) => allowed.includes(record[field]));
  });
}

function analysisMatchesHumanExpected(entry: ContractCase, output: JsonObject): boolean {
  const expected = asObject(entry.input.human_expected, "human_expected");
  const expectedStyles = asStringArray(expected.style, "human_expected.style");
  const expectedSlots = asStringArray(expected.slots, "human_expected.slots");
  const actualStyles = asStringArray(output.style, "output.style");
  if (!Array.isArray(output.items)) return false;
  const actualSlots = output.items.map((item) => String(asObject(item, "output item").slot));

  return (
    JSON.stringify([...actualStyles].sort()) === JSON.stringify([...expectedStyles].sort()) &&
    JSON.stringify(actualSlots.sort()) === JSON.stringify([...expectedSlots].sort())
  );
}

function evaluate(entry: ContractCase, output: JsonObject): boolean {
  const judge = entry.judge;

  switch (judge.type) {
    case "shared_schema_enums":
      return usesOnlySchemaEnums(entry, output);
    case "grounded_product_identity":
      return productIdentityIsGrounded(entry.input, output);
    case "latency_budget": {
      const values = output.durations_seconds;
      if (!Array.isArray(values) || values.length === 0 || !values.every((value) => typeof value === "number")) {
        return false;
      }
      const durations = values as number[];
      const average = durations.reduce((sum, value) => sum + value, 0) / durations.length;
      const sorted = [...durations].sort((a, b) => a - b);
      const p95Index = Math.max(0, Math.ceil(sorted.length * 0.95) - 1);
      const p95 = sorted[p95Index];
      return (
        p95 !== undefined &&
        average <= Number(entry.input.average_max_seconds) &&
        p95 <= Number(entry.input.p95_max_seconds)
      );
    }
    case "max_numeric":
      return Number(valueAtPath(output, String(judge.path))) <= Number(judge.max);
    case "archive_filter_order": {
      const selectedStyle = String(entry.input.selected_style);
      const records = entry.input.records;
      if (!Array.isArray(records)) return false;
      const expected = records
        .map((record) => asObject(record, "record"))
        .filter((record) => asStringArray(record.style, "record.style").includes(selectedStyle))
        .sort((left, right) => String(right.saved_at).localeCompare(String(left.saved_at)))
        .map((record) => String(record.id));
      return JSON.stringify(output.style_image_ids) === JSON.stringify(expected);
    }
    case "analysis_matches_human_expected":
      return analysisMatchesHumanExpected(entry, output);
    case "person_name_grounding": {
      const hasEvidence =
        typeof entry.input.caption_person_name === "string" ||
        typeof entry.input.user_supplied_person_name === "string";
      return hasEvidence || output.person_name === null;
    }
    case "similar_requires_user_decision": {
      const expectedIds = asStringArray(entry.input.matched_wardrobe_item_ids, "matched ids");
      const actualIds = asStringArray(output.wardrobe_item_ids, "wardrobe ids");
      const options = asStringArray(output.decision_options, "decision options");
      return (
        output.gap_status === "비슷함" &&
        output.decision === null &&
        JSON.stringify([...actualIds].sort()) === JSON.stringify([...expectedIds].sort()) &&
        JSON.stringify([...options].sort()) === JSON.stringify(["구매", "활용"].sort())
      );
    }
    case "no_clothing_policy":
      return (
        Array.isArray(output.items) &&
        output.items.length === 0 &&
        output.feed_published === false &&
        output.message === "옷을 찾지 못했어요" &&
        Array.isArray(output.links) &&
        output.links.length === 0
      );
    case "outfit_registered_ids": {
      const registered = new Set(asStringArray(entry.input.registered_wardrobe_item_ids, "registered ids"));
      if (!Array.isArray(output.outfits) || output.outfits.length === 0) return false;
      return output.outfits.every((outfit) => {
        const ids = asStringArray(asObject(outfit, "outfit").wardrobe_item_ids, "outfit ids");
        return ids.length >= 1 && ids.every((id) => registered.has(id));
      });
    }
    case "empty_wardrobe_policy":
      return (
        output.gap_analysis_run === false &&
        Array.isArray(output.item_gap_statuses) &&
        output.item_gap_statuses.every((status) => status === null) &&
        output.message === "옷장을 등록하면 가진 옷과 맞춰 드려요"
      );
    case "registration_friction":
      return (
        output.photo_required === false &&
        Number(output.selection_count) <= Number(judge.max_selections) &&
        output.registered === true
      );
    case "chat_grounding": {
      const registered = new Set(asStringArray(entry.input.registered_wardrobe_item_ids, "registered ids"));
      const claimed = asStringArray(output.claimed_owned_item_ids, "claimed ids");
      const product = asObject(output.product, "product");
      return (
        claimed.every((id) => registered.has(id)) &&
        output.analysis_id_used === entry.input.saved_analysis_id &&
        output.image_reanalysis_count === 0 &&
        output.external_instruction_applied === false &&
        productIdentityIsGrounded({ has_product_evidence: false }, product)
      );
    }
    case "feed_mix_and_filter": {
      const counts = asObject(output.home_counts, "home_counts");
      const styles = asStringArray(output.filtered_styles, "filtered_styles");
      return (
        counts.preferred === judge.preferred_count &&
        counts.neighbor === judge.neighbor_count &&
        counts.other === judge.other_count &&
        Number(counts.preferred) + Number(counts.neighbor) + Number(counts.other) === entry.input.feed_size &&
        styles.every((style) => style === entry.input.selected_filter)
      );
    }
    default:
      assert.fail(`${entry.name}: unsupported judge type ${judge.type}`);
  }
}

test("every SPEC acceptance criterion has at least one golden case", () => {
  const specAcs = new Set([...specText.matchAll(/\*\*(AC\d+)\s/g)].map((match) => match[1]));
  const coveredAcs = new Set(
    [...contracts.cases, ...gapCases.cases].flatMap((entry) => entry.ac),
  );

  assert.ok(specAcs.size > 0, "SPEC must contain acceptance criteria");
  assert.deepEqual([...coveredAcs].sort(), [...specAcs].sort());
});

test("contract golden cases are uniquely named and machine-judgeable", () => {
  assert.ok(contracts.cases.length > 0, "contract cases are required");
  const names = contracts.cases.map((entry) => entry.name);
  assert.equal(new Set(names).size, names.length, "case names must be unique");

  for (const entry of contracts.cases) {
    assert.match(entry.name, /^[a-z0-9_]+$/, `${entry.name}: invalid test id`);
    assert.ok(entry.ac.length > 0, `${entry.name}: AC trace is required`);
    assert.ok(entry.feature.length > 0, `${entry.name}: feature is required`);
    assert.ok(entry.note.trim().length > 0, `${entry.name}: note is required`);
    assert.ok(entry.judge.type.length > 0, `${entry.name}: judge type is required`);
  }
});

for (const entry of contracts.cases) {
  test(`${entry.name}: pass example is accepted`, () => {
    assert.equal(evaluate(entry, entry.pass_output), true);
  });

  test(`${entry.name}: injected defect is rejected`, () => {
    assert.equal(evaluate(entry, entry.fail_output), false);
  });
}
