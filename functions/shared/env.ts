export function secretValue(name: string): string | null {
  const raw = Deno.env.get(name)?.trim();
  if (!raw) return null;
  const unquoted = /^(['"]).*\1$/.test(raw) ? raw.slice(1, -1).trim() : raw;
  const compact = unquoted.replace(/\s+/g, "");
  return compact || null;
}
