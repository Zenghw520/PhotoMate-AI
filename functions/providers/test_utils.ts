export function assert(
  condition: unknown,
  message = "Expected condition to be truthy",
): asserts condition {
  if (!condition) throw new Error(message);
}

function deepEqual(actual: unknown, expected: unknown): boolean {
  if (Object.is(actual, expected)) return true;
  if (
    typeof actual !== "object" || actual === null ||
    typeof expected !== "object" || expected === null
  ) {
    return false;
  }
  if (Array.isArray(actual) || Array.isArray(expected)) {
    if (
      !Array.isArray(actual) || !Array.isArray(expected) ||
      actual.length !== expected.length
    ) return false;
    return actual.every((value, index) => deepEqual(value, expected[index]));
  }
  const actualRecord = actual as Record<string, unknown>;
  const expectedRecord = expected as Record<string, unknown>;
  const actualKeys = Object.keys(actualRecord).sort();
  const expectedKeys = Object.keys(expectedRecord).sort();
  return deepEqual(actualKeys, expectedKeys) &&
    actualKeys.every((key) =>
      deepEqual(actualRecord[key], expectedRecord[key])
    );
}

export function assertEquals(
  actual: unknown,
  expected: unknown,
  message?: string,
): void {
  if (!deepEqual(actual, expected)) {
    throw new Error(
      message ??
        `Expected ${JSON.stringify(expected)}, received ${
          JSON.stringify(actual)
        }`,
    );
  }
}

export function assertStringIncludes(actual: string, expected: string): void {
  assert(
    actual.includes(expected),
    `Expected ${JSON.stringify(actual)} to include ${JSON.stringify(expected)}`,
  );
}

export async function assertRejects(
  operation: () => Promise<unknown>,
): Promise<unknown> {
  try {
    await operation();
  } catch (error) {
    return error;
  }
  throw new Error("Expected promise to reject");
}

export interface FetchCall {
  url: string;
  init?: RequestInit;
}

export async function withFetchStub(
  handler: (call: FetchCall) => Response | Promise<Response>,
  operation: (calls: FetchCall[]) => Promise<void>,
): Promise<void> {
  const original = globalThis.fetch;
  const calls: FetchCall[] = [];
  globalThis.fetch = (
    input: RequestInfo | URL,
    init?: RequestInit,
  ): Promise<Response> => {
    const call = { url: String(input), init };
    calls.push(call);
    return Promise.resolve(handler(call));
  };
  try {
    await operation(calls);
  } finally {
    globalThis.fetch = original;
  }
}

export async function withEnv(
  values: Record<string, string | null>,
  operation: () => Promise<void>,
): Promise<void> {
  const previous = new Map<string, string | undefined>();
  for (const [key, value] of Object.entries(values)) {
    previous.set(key, Deno.env.get(key));
    if (value === null) Deno.env.delete(key);
    else Deno.env.set(key, value);
  }
  try {
    await operation();
  } finally {
    for (const [key, value] of previous) {
      if (value === undefined) Deno.env.delete(key);
      else Deno.env.set(key, value);
    }
  }
}

export function jsonResponse(value: unknown, status = 200): Response {
  return new Response(JSON.stringify(value), {
    status,
    headers: { "content-type": "application/json" },
  });
}

export function timeoutHandler(call: FetchCall): Promise<Response> {
  return new Promise((_, reject) => {
    const signal = call.init?.signal;
    if (signal?.aborted) {
      reject(new DOMException("Aborted", "AbortError"));
      return;
    }
    signal?.addEventListener(
      "abort",
      () => reject(new DOMException("Aborted", "AbortError")),
      {
        once: true,
      },
    );
  });
}
