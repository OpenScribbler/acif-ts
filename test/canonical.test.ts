import { describe, expect, it } from "vitest";

import { canonicalJson, canonicalJsonBytes } from "../src/canonical";

describe("canonicalJson", () => {
  it("sorts object members recursively by raw member name", () => {
    expect(
      canonicalJson({
        b: 2,
        a: { d: 4, c: 3 },
        "2": "two",
        "10": "ten",
        "1": "one",
      }),
    ).toBe('{"1":"one","10":"ten","2":"two","a":{"c":3,"d":4},"b":2}');
  });

  it("emits no insignificant whitespace", () => {
    expect(canonicalJson({ z: [true, false, null], a: "has spaces" })).toBe(
      '{"a":"has spaces","z":[true,false,null]}',
    );
  });

  it("preserves array element order while canonicalizing array contents", () => {
    expect(canonicalJson([{ b: 1, a: 2 }, [3, 1, 2]])).toBe(
      '[{"a":2,"b":1},[3,1,2]]',
    );
  });

  it("omits absent fields and keeps null as a present value", () => {
    expect(canonicalJson({})).toBe("{}");
    expect(canonicalJson({ license: null })).toBe('{"license":null}');
  });

  it("returns UTF-8 bytes for the canonical JSON text", () => {
    expect(Array.from(canonicalJsonBytes({ text: "caf\u00e9" }))).toEqual([
      123, 34, 116, 101, 120, 116, 34, 58, 34, 99, 97, 102, 195, 169, 34, 125,
    ]);
  });

  it("matches the canonical byte string pinned by TV-9", () => {
    expect(
      canonicalJson({
        kind: "command",
        id: "f47ac10b-58cc-4372-a567-0e02b2c3d479",
        display_name: "Review PR",
        version: "1.2.0",
      }),
    ).toBe(
      '{"display_name":"Review PR","id":"f47ac10b-58cc-4372-a567-0e02b2c3d479","kind":"command","version":"1.2.0"}',
    );
  });

  it("rejects values outside the canonical JSON value domain", () => {
    expect(() => canonicalJson(Number.NaN)).toThrow(/non-finite number/);
    expect(() => canonicalJson(Number.POSITIVE_INFINITY)).toThrow(/non-finite number/);
    expect(() => canonicalJson(undefined)).toThrow(/undefined/);
    expect(() => canonicalJson({ absent: undefined })).toThrow(/undefined/);
    expect(() => canonicalJson([undefined])).toThrow(/undefined/);
    expect(() => canonicalJson(1n)).toThrow(/bigint/);
    expect(() => canonicalJson(Symbol("not-json"))).toThrow(/symbol/);
    expect(() => canonicalJson(() => "not-json")).toThrow(/function/);
    expect(() => canonicalJson(new Date("2026-07-14T00:00:00.000Z"))).toThrow(
      /non-plain object/,
    );
  });

  it("rejects invalid Unicode strings", () => {
    expect(() => canonicalJson("\ud800")).toThrow(/lone surrogate/);
    expect(() => canonicalJson({ ["\udc00"]: true })).toThrow(/lone surrogate/);
  });

  it("rejects JavaScript containers that cannot represent JSON data exactly", () => {
    const sparse = new Array<unknown>(1);
    expect(() => canonicalJson(sparse)).toThrow(/sparse array/);

    const withExtraProperty = [1] as unknown[] & { extra?: boolean };
    withExtraProperty.extra = true;
    expect(() => canonicalJson(withExtraProperty)).toThrow(/non-index array property/);

    const cyclic: { self?: unknown } = {};
    cyclic.self = cyclic;
    expect(() => canonicalJson(cyclic)).toThrow(/cyclic structure/);
  });
});
