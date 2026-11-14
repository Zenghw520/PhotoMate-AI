import {
  fetchTrustedJson,
  isHostnameAllowed,
  ProviderHttpError,
} from "./http.ts";
import {
  assert,
  assertEquals,
  assertRejects,
  jsonResponse,
  timeoutHandler,
  withFetchStub,
} from "./test_utils.ts";

const TRUSTED = {
  baseUrl: "https://devapi.qweather.com",
  path: "/v7/test",
  allowedHosts: ["qweather.com"],
  retries: 0,
  retryDelayMs: 0,
} as const;

Deno.test("http: maps JSON and enforces trusted hostnames", async () => {
  assert(isHostnameAllowed("abc.qweatherapi.com", ["qweatherapi.com"]));
  assert(!isHostnameAllowed("qweather.com.evil.example", ["qweather.com"]));
  await withFetchStub(
    (call) => {
      const url = new URL(call.url);
      assertEquals(url.pathname, "/v7/test");
      assertEquals(url.searchParams.get("q"), "value");
      return jsonResponse({ ok: true });
    },
    async (calls) => {
      const result = await fetchTrustedJson<{ ok: boolean }>({
        ...TRUSTED,
        query: { q: "value" },
      });
      assertEquals(result, { ok: true });
      assertEquals(calls.length, 1);
    },
  );

  await withFetchStub(() => jsonResponse({ ok: true }), async (calls) => {
    const error = await assertRejects(() =>
      fetchTrustedJson({
        ...TRUSTED,
        baseUrl: "https://qweather.com.evil.example",
      })
    );
    assert(error instanceof ProviderHttpError);
    assertEquals(error.code, "INVALID_URL");
    assertEquals(calls.length, 0);
  });
});

Deno.test("http: times out and classifies malformed or oversized responses", async () => {
  await withFetchStub(timeoutHandler, async () => {
    const error = await assertRejects(() =>
      fetchTrustedJson({ ...TRUSTED, timeoutMs: 10 })
    );
    assert(error instanceof ProviderHttpError);
    assertEquals(error.code, "TIMEOUT");
  });

  await withFetchStub(() => new Response("not-json"), async () => {
    const error = await assertRejects(() => fetchTrustedJson(TRUSTED));
    assert(error instanceof ProviderHttpError);
    assertEquals(error.code, "INVALID_JSON");
  });

  await withFetchStub(() => new Response("0123456789"), async () => {
    const error = await assertRejects(() =>
      fetchTrustedJson({ ...TRUSTED, maxResponseBytes: 8 })
    );
    assert(error instanceof ProviderHttpError);
    assertEquals(error.code, "RESPONSE_TOO_LARGE");
  });
});

Deno.test("http: retries GET only and sanitizes upstream errors", async () => {
  let getAttempts = 0;
  await withFetchStub(() => {
    getAttempts++;
    return getAttempts === 1
      ? jsonResponse({ error: "secret upstream body" }, 500)
      : jsonResponse({ ok: true });
  }, async (calls) => {
    const result = await fetchTrustedJson<{ ok: boolean }>({
      ...TRUSTED,
      query: { key: "secret-key" },
      retries: 1,
    });
    assertEquals(result, { ok: true });
    assertEquals(calls.length, 2);
  });

  await withFetchStub(
    (call) =>
      new Response("secret upstream body", {
        status: call.init?.method === "POST" ? 500 : 401,
      }),
    async (calls) => {
      const error = await assertRejects(() =>
        fetchTrustedJson({
          ...TRUSTED,
          query: { key: "secret-key" },
        })
      );
      assert(error instanceof ProviderHttpError);
      assertEquals(error.code, "HTTP_ERROR");
      assert(!error.message.includes("secret-key"));
      assert(!error.message.includes("secret upstream body"));

      const postError = await assertRejects(() =>
        fetchTrustedJson({
          ...TRUSTED,
          method: "POST",
          body: "{}",
          retries: 2,
        })
      );
      assert(postError instanceof ProviderHttpError);
      assertEquals(calls.length, 2, "POST must not be retried");
    },
  );
});
