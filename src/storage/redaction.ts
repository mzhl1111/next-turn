export interface RedactionOptions {
  readonly keyPatterns?: readonly RegExp[];
  readonly valuePatterns?: readonly RegExp[];
  readonly replacement?: string;
}

const defaultKeys = [
  /authorization/i,
  /api[-_]?key/i,
  /cookie/i,
  /password/i,
  /secret/i,
  /token/i,
];

const defaultValues = [
  /\bsk-or-v1-[A-Za-z0-9_-]+\b/g,
  /\bBearer\s+[A-Za-z0-9._~+/=-]+\b/gi,
];

export function redactValue(value: unknown, options: RedactionOptions = {}): unknown {
  const replacement = options.replacement ?? "[REDACTED]";
  const keyPatterns = [...defaultKeys, ...(options.keyPatterns ?? [])];
  const valuePatterns = [...defaultValues, ...(options.valuePatterns ?? [])];
  const seen = new WeakSet<object>();

  function visit(item: unknown): unknown {
    if (typeof item === "string") {
      return valuePatterns.reduce(
        (result, pattern) => result.replace(pattern, replacement),
        item,
      );
    }
    if (Array.isArray(item)) return item.map(visit);
    if (typeof item !== "object" || item === null) return item;
    if (seen.has(item)) throw new Error("Cannot archive cyclic data");
    seen.add(item);
    const result: Record<string, unknown> = {};
    for (const [key, nested] of Object.entries(item)) {
      result[key] = keyPatterns.some((pattern) => pattern.test(key))
        ? replacement
        : visit(nested);
    }
    seen.delete(item);
    return result;
  }

  return visit(value);
}
