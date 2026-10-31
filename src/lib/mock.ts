// Sample responses used only when QLOO_API_KEY is unset. The UI labels these as
// sample data. Their shape mirrors the live API so the same parser handles both.

const cities = [
  ["Austin", 30.27, -97.74, 0.94],
  ["Portland", 45.52, -122.68, 0.91],
  ["Denver", 39.74, -104.99, 0.88],
  ["Chicago", 41.88, -87.63, 0.85],
  ["Nashville", 36.16, -86.78, 0.82],
  ["Brooklyn", 40.68, -73.94, 0.8],
] as const;

const entity = (id: string, name: string, affinity: number, extra: object = {}) => ({
  entity_id: id,
  name,
  popularity: 0.5,
  query: { affinity },
  ...extra,
});

export function mockResponse(path: string, query: URLSearchParams) {
  if (path === "/search") {
    return { results: [entity("sample-seed", query.get("query") ?? "Sample Artist", 1)] };
  }
  if (path === "/v2/tags") {
    return { results: { tags: [{ id: "sample-tag-venue", name: "music venue" }] } };
  }

  const type = query.get("filter.type");
  if (type === "urn:entity:destination") {
    return {
      results: {
        entities: cities.map(([name, lat, lon, affinity]) =>
          entity(`sample-city-${name}`, name, affinity, { location: { lat, lon } }),
        ),
      },
    };
  }
  if (type === "urn:entity:place") {
    const city = query.get("filter.geocode.name") ?? "City";
    return {
      results: {
        entities: ["Sample Room", "Sample Hall"].map((name, i) =>
          entity(`sample-${city}-${i}`, `${name} ${city}`, 0.9 - i / 10, {
            properties: { address: `${100 + i} Sample St, ${city}` },
          }),
        ),
      },
    };
  }
  if (type === "urn:entity:brand") {
    return {
      results: {
        entities: ["Sample Coffee Roasters", "Sample Denim Co."].map((name, i) =>
          entity(`sample-brand-${i}`, name, 0.8 - i / 10),
        ),
      },
    };
  }
  return {
    results: {
      entities: ["Sample Support A", "Sample Support B", "Sample Support C"].map((name, i) =>
        entity(`sample-artist-${i}`, name, 0.9 - i / 10),
      ),
    },
  };
}
