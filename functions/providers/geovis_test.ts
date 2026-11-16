import { getTerrainTile } from "./geovis.ts";
import { assertEquals, withEnv, withFetchStub } from "./test_utils.ts";

const PNG_BYTES = new Uint8Array(200).fill(7);

Deno.test("geovis: requires a token and validates tile coordinates", async () => {
  await withEnv({ GEOVIS_EARTH_TOKEN: null }, async () => {
    await withFetchStub(() => new Response("unexpected"), async (calls) => {
      const missing = await getTerrainTile(11, 100, 200);
      assertEquals(missing.status, "UNCONFIGURED");
      assertEquals(calls.length, 0);
      const invalid = await getTerrainTile(3, 0, 0);
      assertEquals(invalid.status, "INVALID");
    });
  });
});

Deno.test("geovis: proxies terrain-rgb tiles with the token kept server-side", async () => {
  await withEnv({ GEOVIS_EARTH_TOKEN: "test-terrain-token" }, async () => {
    await withFetchStub((call) => {
      const url = new URL(call.url);
      assertEquals(url.hostname, "api.open.geovisearth.com");
      assertEquals(url.pathname, "/map/v1/terrain-rgb/11/100/200");
      assertEquals(url.searchParams.get("format"), "png");
      assertEquals(url.searchParams.get("tmsIds"), "w");
      assertEquals(url.searchParams.get("token"), "test-terrain-token");
      return new Response(PNG_BYTES, {
        headers: { "content-type": "image/png" },
      });
    }, async (calls) => {
      const tile = await getTerrainTile(11, 100, 200);
      assertEquals(tile.status, "OK");
      assertEquals(tile.data?.length, PNG_BYTES.length);
      assertEquals(tile.contentType, "image/png");
      assertEquals(calls.length, 1);
    });
  });
});
