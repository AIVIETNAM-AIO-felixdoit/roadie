import { mockResponse } from "./mock";

const BASE_URL = "https://hackathon.api.qloo.com";
const CACHE_TTL_MS = 30 * 60 * 1000;

export type Entity = {
  id: string;
  name: string;
  popularity?: number;
  affinity?: number;
  description?: string;
  image?: string;
  address?: string;
  lat?: number;
  lng?: number;
};

export type Params = Record<string, string | number | undefined>;

const cache = new Map<string, { at: number; body: unknown }>();

export const isLive = () => Boolean(process.env.QLOO_API_KEY);

async function get(path: string, params: Params): Promise<any> {
  const query = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined && value !== "") query.set(key, String(value));
  }
  if (!isLive()) return mockResponse(path, query);

  const url = `${BASE_URL}${path}?${query}`;
  const hit = cache.get(url);
  if (hit && Date.now() - hit.at < CACHE_TTL_MS) return hit.body;

  for (let attempt = 0; ; attempt++) {
    const res = await fetch(url, {
      headers: { "X-Api-Key": process.env.QLOO_API_KEY! },
      signal: AbortSignal.timeout(15000),
    });
    if (res.ok) {
      const body = await res.json();
      cache.set(url, { at: Date.now(), body });
      return body;
    }
    if (attempt === 0 && (res.status === 429 || res.status >= 500)) {
      await new Promise((resolve) => setTimeout(resolve, 800));
      continue;
    }
    throw new Error(`Qloo ${path} returned ${res.status}`);
  }
}

function toEntity(raw: any): Entity {
  const props = raw.properties ?? {};
  const location = raw.location ?? props.geocode ?? {};
  return {
    id: raw.entity_id ?? raw.id,
    name: raw.name,
    popularity: raw.popularity,
    affinity: raw.query?.affinity ?? raw.affinity,
    description: props.short_description ?? props.description,
    image: props.image?.url,
    address: props.address ?? raw.disambiguation,
    lat: location.lat ?? location.latitude,
    lng: location.lon ?? location.lng ?? location.longitude,
  };
}

function entities(body: any): Entity[] {
  const list = body?.results?.entities ?? body?.results ?? [];
  return Array.isArray(list) ? list.filter((e) => e?.name).map(toEntity) : [];
}

export async function searchArtists(query: string): Promise<Entity[]> {
  return entities(await get("/search", { query, types: "urn:entity:artist", take: 5 }));
}

export async function findVenueTag(): Promise<string | undefined> {
  const body = await get("/v2/tags", {
    "filter.query": "music venue",
    "filter.tag.types": "urn:tag:category:place",
    take: 5,
  });
  const tags = body?.results?.tags ?? [];
  return tags[0]?.id ?? tags[0]?.tag_id;
}

export async function similarArtists(ids: string[], maxPopularity: number): Promise<Entity[]> {
  return entities(
    await get("/v2/insights", {
      "filter.type": "urn:entity:artist",
      "signal.interests.entities": ids.join(","),
      "filter.exclude.entities": ids.join(","),
      "filter.popularity.max": maxPopularity,
      take: 12,
    }),
  );
}

export async function rankCities(ids: string[], countryCode?: string): Promise<Entity[]> {
  return entities(
    await get("/v2/insights", {
      "filter.type": "urn:entity:destination",
      "signal.interests.entities": ids.join(","),
      "filter.geocode.country_code": countryCode,
      take: 15,
    }),
  );
}

export async function findVenues(ids: string[], city: string, tag?: string): Promise<Entity[]> {
  return entities(
    await get("/v2/insights", {
      "filter.type": "urn:entity:place",
      "filter.geocode.name": city,
      "filter.tags": tag,
      "signal.interests.entities": ids.join(","),
      take: 8,
    }),
  );
}

export async function findBrands(ids: string[]): Promise<Entity[]> {
  return entities(
    await get("/v2/insights", {
      "filter.type": "urn:entity:brand",
      "signal.interests.entities": ids.join(","),
      take: 10,
    }),
  );
}
