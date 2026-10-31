import { chat, hasLlm, type Message } from "./llm";
import * as qloo from "./qloo";
import type { Entity } from "./qloo";

const MAX_TURNS = 12;
const TIME_BUDGET_MS = 30000;

export type TourInput = { artist: string; country: string; stops: number };

export type Stop = {
  city: string;
  affinity?: number;
  venue: string;
  address?: string;
  support?: string;
  why: string;
  kmFromPrevious?: number;
};

export type Plan = {
  artist: string;
  summary: string;
  stops: Stop[];
  brands: { name: string; why: string }[];
  totalKm?: number;
  planner: "agent" | "deterministic";
  data: "live" | "sample";
};

export type AgentEvent =
  | { type: "step"; label: string; detail?: string }
  | { type: "plan"; plan: Plan }
  | { type: "error"; message: string };

type Draft = {
  summary: string;
  stops: { city: string; venue: string; support?: string; why: string }[];
  brands: { name: string; why: string }[];
};

const fn = (name: string, description: string, properties: object, required: string[]) => ({
  type: "function",
  function: { name, description, parameters: { type: "object", properties, required } },
});

const ids = { type: "array", items: { type: "string" }, description: "Qloo entity ids" };

const TOOLS = [
  fn("search_artist", "Resolve an artist name to Qloo entity ids.", { name: { type: "string" } }, ["name"]),
  fn(
    "similar_artists",
    "Artists with overlapping fans, for support slots. Lower max_popularity finds smaller acts.",
    { entity_ids: ids, max_popularity: { type: "number" } },
    ["entity_ids"],
  ),
  fn(
    "rank_cities",
    "Rank cities by how strongly local taste matches these artists.",
    { entity_ids: ids, country_code: { type: "string" } },
    ["entity_ids"],
  ),
  fn(
    "find_venues",
    "Find venues in a city that match the audience's taste.",
    { entity_ids: ids, city: { type: "string" } },
    ["entity_ids", "city"],
  ),
  fn("find_brands", "Find brands this audience already loves.", { entity_ids: ids }, ["entity_ids"]),
  fn(
    "submit_tour",
    "Submit the finished tour. Every city, venue, support act and brand must come from a tool result.",
    {
      summary: { type: "string" },
      stops: {
        type: "array",
        items: {
          type: "object",
          properties: {
            city: { type: "string" },
            venue: { type: "string" },
            support: { type: "string" },
            why: { type: "string", description: "One sentence citing the taste evidence." },
          },
          required: ["city", "venue", "why"],
        },
      },
      brands: {
        type: "array",
        items: {
          type: "object",
          properties: { name: { type: "string" }, why: { type: "string" } },
          required: ["name", "why"],
        },
      },
    },
    ["summary", "stops", "brands"],
  ),
];

const SYSTEM = `You are Roadie, a tour manager for independent musicians.
Plan a tour using only evidence from your tools. Never name a city, venue, artist or brand
that no tool returned. Resolve the artist first, then look at similar artists, rank cities,
find a venue in each chosen city, and find brands. Prefer cities with high affinity, but
explain trade-offs. Keep each "why" to one concrete sentence built only from tool results,
such as rank or affinity. Do not add facts about a place, artist or brand from your own
knowledge. Finish by calling submit_tour.`;

function haversineKm(a: Entity, b: Entity) {
  const rad = (deg: number) => (deg * Math.PI) / 180;
  const dLat = rad(b.lat! - a.lat!);
  const dLng = rad(b.lng! - a.lng!);
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(rad(a.lat!)) * Math.cos(rad(b.lat!)) * Math.sin(dLng / 2) ** 2;
  return Math.round(6371 * 2 * Math.asin(Math.sqrt(h)));
}

const hasCoords = (e?: Entity): e is Entity => e?.lat !== undefined && e?.lng !== undefined;

class Tour {
  artists = new Map<string, Entity>();
  cities = new Map<string, Entity>();
  venues = new Map<string, Entity>();
  brands = new Map<string, Entity>();

  constructor(
    private input: TourInput,
    private emit: (event: AgentEvent) => void,
  ) {}

  private remember(store: Map<string, Entity>, list: Entity[]) {
    for (const entity of list) store.set(entity.name.toLowerCase(), entity);
    return list.map(({ id, name, affinity, popularity }) => ({ id, name, affinity, popularity }));
  }

  async run(name: string, args: any) {
    switch (name) {
      case "search_artist": {
        this.emit({ type: "step", label: `Looking up ${args.name}` });
        return this.remember(this.artists, await qloo.searchArtists(args.name));
      }
      case "similar_artists": {
        this.emit({ type: "step", label: "Finding acts with overlapping fans" });
        return this.remember(
          this.artists,
          await qloo.similarArtists(args.entity_ids, args.max_popularity ?? 0.9),
        );
      }
      case "rank_cities": {
        this.emit({ type: "step", label: "Ranking cities by taste affinity" });
        return this.remember(
          this.cities,
          await qloo.rankCities(args.entity_ids, args.country_code ?? this.input.country),
        );
      }
      case "find_venues": {
        this.emit({ type: "step", label: `Scouting venues in ${args.city}` });
        const tag = await qloo.findVenueTag();
        return this.remember(this.venues, await qloo.findVenues(args.entity_ids, args.city, tag));
      }
      case "find_brands": {
        this.emit({ type: "step", label: "Finding brand partners" });
        return this.remember(this.brands, await qloo.findBrands(args.entity_ids));
      }
      default:
        throw new Error(`Unknown tool ${name}`);
    }
  }

  // Rejects anything the tools never returned, so the model cannot invent a venue.
  problems(draft: Draft) {
    const missing: string[] = [];
    const check = (store: Map<string, Entity>, name: string | undefined, kind: string) => {
      if (name && !store.has(name.toLowerCase())) missing.push(`${kind} "${name}"`);
    };
    for (const stop of draft.stops) {
      check(this.cities, stop.city, "city");
      check(this.venues, stop.venue, "venue");
      check(this.artists, stop.support, "support act");
    }
    for (const brand of draft.brands) check(this.brands, brand.name, "brand");
    return missing;
  }

  finish(draft: Draft, planner: Plan["planner"]): Plan {
    const remaining = [...draft.stops];
    const ordered: typeof remaining = [];
    let previous: Entity | undefined;

    // Nearest-neighbour routing from the highest-affinity city.
    while (remaining.length) {
      let next = 0;
      if (hasCoords(previous)) {
        let best = Infinity;
        remaining.forEach((stop, i) => {
          const city = this.cities.get(stop.city.toLowerCase());
          const km = hasCoords(city) ? haversineKm(previous!, city) : Infinity;
          if (km < best) [best, next] = [km, i];
        });
      }
      const [stop] = remaining.splice(next, 1);
      ordered.push(stop);
      previous = this.cities.get(stop.city.toLowerCase());
    }

    let totalKm = 0;
    const stops = ordered.map((stop, i): Stop => {
      const city = this.cities.get(stop.city.toLowerCase());
      const before = i ? this.cities.get(ordered[i - 1].city.toLowerCase()) : undefined;
      const km = hasCoords(city) && hasCoords(before) ? haversineKm(before, city) : undefined;
      totalKm += km ?? 0;
      return {
        ...stop,
        affinity: city?.affinity,
        address: this.venues.get(stop.venue.toLowerCase())?.address,
        kmFromPrevious: km,
      };
    });

    return {
      artist: this.input.artist,
      summary: draft.summary,
      stops,
      brands: draft.brands,
      totalKm: totalKm || undefined,
      planner,
      data: qloo.isLive() ? "live" : "sample",
    };
  }
}

async function runAgent(tour: Tour, input: TourInput, deadline: number) {
  const messages: Message[] = [
    { role: "system", content: SYSTEM },
    {
      role: "user",
      content: `Plan a ${input.stops}-stop tour for "${input.artist}" in country code ${input.country}.`,
    },
  ];

  for (let turn = 0; turn < MAX_TURNS && Date.now() < deadline; turn++) {
    const reply = await chat(messages, TOOLS);
    messages.push({ ...reply, role: "assistant" });
    for (const call of reply.tool_calls ?? []) {
      const args = JSON.parse(call.function.arguments || "{}");
      if (call.function.name === "submit_tour") {
        const missing = tour.problems(args);
        if (!missing.length) return tour.finish(args, "agent");
        messages.push({
          role: "tool",
          tool_call_id: call.id,
          content: `Rejected: not from any tool result: ${missing.join(", ")}. Fix and resubmit.`,
        });
        continue;
      }
      let content: string;
      try {
        content = JSON.stringify(await tour.run(call.function.name, args));
      } catch (error) {
        content = `Tool error: ${(error as Error).message}`;
      }
      messages.push({ role: "tool", tool_call_id: call.id, content });
    }
  }
  throw new Error("Agent ran out of turns or time");
}

// Same tools, fixed order. Keeps the demo usable when no LLM key or quota is available.
async function runDeterministic(tour: Tour, input: TourInput): Promise<Plan> {
  const [seed] = await tour.run("search_artist", { name: input.artist });
  if (!seed) throw new Error(`Qloo has no match for "${input.artist}"`);

  const entity_ids = [seed.id];
  const similar = await tour.run("similar_artists", { entity_ids, max_popularity: 0.9 });
  const cities = await tour.run("rank_cities", { entity_ids });
  const brands = await tour.run("find_brands", { entity_ids });

  const stops: Draft["stops"] = [];
  for (const city of cities) {
    if (stops.length === input.stops) break;
    const [venue] = await tour.run("find_venues", { entity_ids, city: city.name });
    if (!venue) continue;
    stops.push({
      city: city.name,
      venue: venue.name,
      support: similar[stops.length % Math.max(similar.length, 1)]?.name,
      why: `${city.name} ranks #${stops.length + 1} for taste affinity with this audience.`,
    });
  }
  if (!stops.length) throw new Error("No matching venues found");

  return tour.finish(
    {
      summary: `A ${stops.length}-stop route through the cities whose taste best matches ${seed.name}.`,
      stops,
      brands: brands.slice(0, 3).map((brand) => ({
        name: brand.name,
        why: `Shares an audience with ${seed.name}.`,
      })),
    },
    "deterministic",
  );
}

export async function planTour(input: TourInput, emit: (event: AgentEvent) => void) {
  const tour = new Tour(input, emit);
  try {
    if (hasLlm()) {
      try {
        emit({ type: "plan", plan: await runAgent(tour, input, Date.now() + TIME_BUDGET_MS) });
        return;
      } catch (error) {
        emit({
          type: "step",
          label: "Switching to the deterministic planner",
          detail: (error as Error).message,
        });
      }
    }
    emit({ type: "plan", plan: await runDeterministic(tour, input) });
  } catch (error) {
    emit({ type: "error", message: (error as Error).message });
  }
}
