import {
  gcj02ToWgs84,
  isOutsideChina,
  reverseGeocode,
  searchLocations,
  searchPhotoSpots,
  wgs84ToGcj02,
} from "./amap.ts";
import {
  assert,
  assertEquals,
  jsonResponse,
  withEnv,
  withFetchStub,
} from "./test_utils.ts";

Deno.test("amap: WGS84/GCJ-02 round trip and outside-China identity", () => {
  const original = { latitude: 39.9087, longitude: 116.3975 };
  const gcj = wgs84ToGcj02(original.latitude, original.longitude);
  const wgs = gcj02ToWgs84(gcj.latitude, gcj.longitude);
  assert(Math.abs(wgs.latitude - original.latitude) < 0.000001);
  assert(Math.abs(wgs.longitude - original.longitude) < 0.000001);
  assert(isOutsideChina(48.8566, 2.3522));
  assertEquals(wgs84ToGcj02(48.8566, 2.3522), {
    latitude: 48.8566,
    longitude: 2.3522,
  });
});

Deno.test("amap: returns explicit unconfigured status without fetching", async () => {
  await withEnv({ AMAP_API_KEY: null }, async () => {
    await withFetchStub(() => jsonResponse({}), async (calls) => {
      const search = await searchLocations("惠州");
      const reverse = await reverseGeocode(39.9, 116.4);
      assertEquals(search.status, "UNCONFIGURED");
      assertEquals(search.locations, []);
      assertEquals(reverse.status, "UNCONFIGURED");
      assertEquals(reverse.location, null);
      assertEquals(calls.length, 0);
    });
  });
});

Deno.test("amap: trims quotes and whitespace from the configured key", async () => {
  await withEnv({ AMAP_API_KEY: ' "test-amap-key" ' }, async () => {
    await withFetchStub((call) => {
      assertEquals(new URL(call.url).searchParams.get("key"), "test-amap-key");
      return jsonResponse({ status: "1", districts: [] });
    }, async () => {
      const result = await searchLocations("惠州");
      assertEquals(result.status, "OK");
      assertEquals(result.locations, []);
    });
  });
});

Deno.test("amap: maps city search to district-level WGS84 results", async () => {
  const districtCenter = { latitude: 23.08375, longitude: 114.38278 };
  const gcj = wgs84ToGcj02(
    districtCenter.latitude,
    districtCenter.longitude,
  );
  await withEnv({ AMAP_API_KEY: "test-amap-key" }, async () => {
    await withFetchStub((call) => {
      const url = new URL(call.url);
      assertEquals(url.pathname, "/v3/config/district");
      assertEquals(url.searchParams.get("keywords"), "惠州");
      assertEquals(url.searchParams.get("subdistrict"), "2");
      assertEquals(url.searchParams.get("extensions"), "base");
      return jsonResponse({
        status: "1",
        districts: [{
          name: "广东省",
          adcode: "440000",
          level: "province",
          districts: [{
            name: "惠州市",
            adcode: "441300",
            level: "city",
            districts: [{
              name: "惠城区",
              adcode: "441302",
              center: `${gcj.longitude},${gcj.latitude}`,
              level: "district",
              districts: [],
            }],
          }],
        }],
      });
    }, async (calls) => {
      const result = await searchLocations("惠州");
      assertEquals(result.status, "OK");
      assertEquals(result.locations.length, 1);
      const location = result.locations[0];
      assertEquals(location.name, "惠州市惠城区");
      assertEquals(location.region, "广东省 惠州市");
      assertEquals(location.id, "441302");
      assertEquals(location.precision, "DISTRICT");
      assertEquals(location.timezone, "Asia/Shanghai");
      assert(
        Math.abs(location.latitude - districtCenter.latitude) < 0.00001,
      );
      assert(
        Math.abs(location.longitude - districtCenter.longitude) < 0.00001,
      );
      assertEquals(calls.length, 1);
    });
  });
});

Deno.test("amap: deduplicates districts, keeps direct matches and drops overseas centers", async () => {
  await withEnv({ AMAP_API_KEY: "test-amap-key" }, async () => {
    await withFetchStub(() =>
      jsonResponse({
        status: "1",
        districts: [
          {
            name: "惠城区",
            adcode: "441302",
            center: "114.38278,23.08375",
            level: "district",
            districts: [],
          },
          {
            name: "惠城区",
            adcode: "441302",
            center: "114.38278,23.08375",
            level: "district",
            districts: [],
          },
          {
            name: "境外区",
            adcode: "999999",
            center: "2.3522,48.8566",
            level: "district",
            districts: [],
          },
        ],
      }), async () => {
      const result = await searchLocations("惠城区");
      assertEquals(result.status, "OK");
      assertEquals(result.locations.length, 1);
      assertEquals(result.locations[0].name, "惠城区");
      assertEquals(result.locations[0].precision, "DISTRICT");
      assertEquals(result.locations[0].region, undefined);
    });
  });
});

Deno.test("amap: enriches keyword district results with province and city", async () => {
  await withEnv({ AMAP_API_KEY: "test-amap-key" }, async () => {
    await withFetchStub((call) => {
      const url = new URL(call.url);
      if (url.pathname === "/v3/geocode/regeo") {
        return jsonResponse({
          status: "1",
          regeocode: {
            addressComponent: {
              province: "北京市",
              city: "北京市",
              district: "朝阳区",
            },
          },
        });
      }
      return jsonResponse({
        status: "1",
        districts: [{
          name: "朝阳区",
          adcode: "110105",
          center: "116.486409,39.921489",
          level: "district",
          districts: [],
        }],
      });
    }, async (calls) => {
      const result = await searchLocations("朝阳区");
      assertEquals(result.status, "OK");
      assertEquals(result.locations.length, 1);
      assertEquals(result.locations[0].region, "北京市");
      assertEquals(calls.length, 2);
    });
  });
});

Deno.test("amap: reverse geocodes converted coordinates and retains GPS precision", async () => {
  const original = { latitude: 31.2304, longitude: 121.4737 };
  await withEnv({ AMAP_API_KEY: "test-amap-key" }, async () => {
    await withFetchStub((call) => {
      const url = new URL(call.url);
      assertEquals(url.pathname, "/v3/geocode/regeo");
      const expected = wgs84ToGcj02(original.latitude, original.longitude);
      const [longitude, latitude] = (url.searchParams.get("location") ?? "")
        .split(",").map(Number);
      assert(Math.abs(longitude - expected.longitude) < 0.0000001);
      assert(Math.abs(latitude - expected.latitude) < 0.0000001);
      return jsonResponse({
        status: "1",
        regeocode: {
          formatted_address: "上海市黄浦区人民广场",
          addressComponent: {
            country: "中国",
            province: "上海市",
            city: "上海市",
            district: "黄浦区",
            township: "南京东路街道",
            adcode: "310101",
          },
        },
      });
    }, async () => {
      const result = await reverseGeocode(
        original.latitude,
        original.longitude,
      );
      assertEquals(result.status, "OK");
      assertEquals(result.location?.name, "上海市黄浦区人民广场");
      assertEquals(result.location?.precision, "GPS");
      assertEquals(result.location?.latitude, original.latitude);
      assertEquals(result.location?.longitude, original.longitude);
    });
  });
});

Deno.test("amap: reverse lookup never invents overseas results and fails safely", async () => {
  await withEnv({ AMAP_API_KEY: "test-amap-key" }, async () => {
    await withFetchStub(() => jsonResponse({ status: "1" }), async (calls) => {
      const result = await reverseGeocode(48.8566, 2.3522);
      assertEquals(result.location, null);
      assertEquals(calls.length, 0, "Overseas reverse must not call AMap");
    });

    await withFetchStub(() => new Response("{bad json"), async () => {
      const result = await reverseGeocode(31.2304, 121.4737);
      assertEquals(result.status, "UNAVAILABLE");
      assertEquals(result.location, null);
    });
  });
});

Deno.test("amap: search reports unavailable on malformed JSON and empty result honestly", async () => {
  await withEnv({ AMAP_API_KEY: "test-amap-key" }, async () => {
    await withFetchStub(() => new Response("{bad json"), async () => {
      const result = await searchLocations("惠州");
      assertEquals(result.status, "UNAVAILABLE");
      assertEquals(result.locations, []);
    });

    await withFetchStub(
      () => jsonResponse({ status: "1", districts: [] }),
      async () => {
        const result = await searchLocations("惠州");
        assertEquals(result.status, "OK");
        assertEquals(result.locations, []);
        assertEquals(result.message, "未找到中国境内匹配的区县。");
      },
    );
  });
});

Deno.test("amap: recommends nearby photo spots and filters service POIs", async () => {
  await withEnv({ AMAP_API_KEY: "test-amap-key" }, async () => {
    await withFetchStub((call) => {
      const url = new URL(call.url);
      assertEquals(url.pathname, "/v3/place/around");
      assertEquals(url.searchParams.get("radius"), "20000");
      assertEquals(url.searchParams.get("sortrule"), "distance");
      return jsonResponse({
        status: "1",
        pois: [
          {
            id: "B001",
            name: "湖边观景台",
            address: "环湖路",
            type: "风景名胜;观景台",
            location: "114.38278,23.08375",
            distance: "1200",
          },
          {
            id: "B002",
            name: "景区停车场",
            address: [],
            type: "交通设施",
            location: "114.38278,23.08375",
            distance: "800",
          },
        ],
      });
    }, async (calls) => {
      const result = await searchPhotoSpots(23.08375, 114.38278, "LANDSCAPE");
      assertEquals(result.status, "OK");
      assertEquals(result.spots.length, 1);
      assertEquals(result.spots[0].name, "湖边观景台");
      assertEquals(result.spots[0].distanceMeters, 1200);
      assert(result.spots[0].gcj.latitude > 23);
      assertEquals(calls.length, 1);
    });
  });
});
