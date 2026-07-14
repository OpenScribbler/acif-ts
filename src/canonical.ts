export function canonicalJson(value: unknown): string {
  return serializeCanonicalJson(value, "$", new Set<object>());
}

export function canonicalJsonBytes(value: unknown): Uint8Array {
  return new TextEncoder().encode(canonicalJson(value));
}

function serializeCanonicalJson(
  value: unknown,
  path: string,
  ancestors: Set<object>,
): string {
  switch (typeof value) {
    case "string":
      assertValidUnicodeString(value, path);
      return stringifyJsonString(value);

    case "number":
      if (!Number.isFinite(value)) {
        throw new Error(`Cannot canonicalize non-finite number at ${path}`);
      }
      return stringifyJsonPrimitive(value);

    case "boolean":
      return value ? "true" : "false";

    case "object":
      if (value === null) {
        return "null";
      }
      if (Array.isArray(value)) {
        return serializeArray(value, path, ancestors);
      }
      return serializeObject(value, path, ancestors);

    case "undefined":
      throw new Error(`Cannot canonicalize undefined at ${path}; absent fields must be omitted`);

    case "bigint":
    case "function":
    case "symbol":
      throw new Error(`Cannot canonicalize ${typeof value} at ${path}; value is not JSON`);
  }
}

function serializeArray(
  value: readonly unknown[],
  path: string,
  ancestors: Set<object>,
): string {
  assertNoCycle(value, path, ancestors);
  assertNoSymbolProperties(value, path);
  assertNoExtraArrayProperties(value, path);

  ancestors.add(value);
  try {
    const elements: string[] = [];
    for (let index = 0; index < value.length; index += 1) {
      if (!Object.hasOwn(value, index)) {
        throw new Error(`Cannot canonicalize sparse array at ${path}[${index}]`);
      }
      elements.push(serializeCanonicalJson(value[index], `${path}[${index}]`, ancestors));
    }
    return `[${elements.join(",")}]`;
  } finally {
    ancestors.delete(value);
  }
}

function serializeObject(
  value: object,
  path: string,
  ancestors: Set<object>,
): string {
  if (!isPlainJsonObject(value)) {
    throw new Error(`Cannot canonicalize non-plain object at ${path}; value is not JSON`);
  }

  assertNoCycle(value, path, ancestors);
  assertNoSymbolProperties(value, path);

  const entries = Object.entries(value).sort(([left], [right]) =>
    compareUtf16CodeUnits(left, right),
  );

  ancestors.add(value);
  try {
    const members = entries.map(([key, memberValue]) => {
      assertValidUnicodeString(key, `${path}[${stringifyJsonString(key)}]`);
      return `${stringifyJsonString(key)}:${serializeCanonicalJson(
        memberValue,
        `${path}[${stringifyJsonString(key)}]`,
        ancestors,
      )}`;
    });
    return `{${members.join(",")}}`;
  } finally {
    ancestors.delete(value);
  }
}

function isPlainJsonObject(value: object): boolean {
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

function assertNoCycle(value: object, path: string, ancestors: Set<object>): void {
  if (ancestors.has(value)) {
    throw new Error(`Cannot canonicalize cyclic structure at ${path}`);
  }
}

function assertNoSymbolProperties(value: object, path: string): void {
  if (Object.getOwnPropertySymbols(value).length > 0) {
    throw new Error(`Cannot canonicalize symbol-keyed property at ${path}; object member names must be strings`);
  }
}

function assertNoExtraArrayProperties(value: readonly unknown[], path: string): void {
  for (const key of Object.keys(value)) {
    if (!isCanonicalArrayIndex(key) || Number(key) >= value.length) {
      throw new Error(`Cannot canonicalize non-index array property ${stringifyJsonString(key)} at ${path}`);
    }
  }
}

function isCanonicalArrayIndex(key: string): boolean {
  if (key === "0") {
    return true;
  }
  return /^[1-9][0-9]*$/.test(key) && Number.isSafeInteger(Number(key));
}

function assertValidUnicodeString(value: string, path: string): void {
  for (let index = 0; index < value.length; index += 1) {
    const codeUnit = value.charCodeAt(index);
    if (codeUnit >= 0xd800 && codeUnit <= 0xdbff) {
      const next = value.charCodeAt(index + 1);
      if (Number.isNaN(next) || next < 0xdc00 || next > 0xdfff) {
        throw new Error(`Cannot canonicalize string with lone surrogate at ${path}`);
      }
      index += 1;
    } else if (codeUnit >= 0xdc00 && codeUnit <= 0xdfff) {
      throw new Error(`Cannot canonicalize string with lone surrogate at ${path}`);
    }
  }
}

function stringifyJsonString(value: string): string {
  const serialized = JSON.stringify(value);
  if (serialized === undefined) {
    throw new Error("Cannot canonicalize string; JSON serialization failed");
  }
  return serialized;
}

function stringifyJsonPrimitive(value: number): string {
  const serialized = JSON.stringify(value);
  if (serialized === undefined) {
    throw new Error("Cannot canonicalize number; JSON serialization failed");
  }
  return serialized;
}

function compareUtf16CodeUnits(left: string, right: string): number {
  const length = Math.min(left.length, right.length);
  for (let index = 0; index < length; index += 1) {
    const difference = left.charCodeAt(index) - right.charCodeAt(index);
    if (difference !== 0) {
      return difference;
    }
  }
  return left.length - right.length;
}
