import { planTour, type AgentEvent } from "../../../lib/agent";

export const maxDuration = 60;

export async function POST(request: Request) {
  const body = await request.json().catch(() => ({}));
  const artist = String(body.artist ?? "").trim().slice(0, 80);
  const country = /^[A-Z]{2}$/.test(body.country) ? body.country : "US";
  const stops = Math.min(Math.max(Number(body.stops) || 4, 2), 6);
  if (!artist) return Response.json({ error: "Artist is required" }, { status: 400 });

  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    async start(controller) {
      const emit = (event: AgentEvent) =>
        controller.enqueue(encoder.encode(`${JSON.stringify(event)}\n`));
      await planTour({ artist, country, stops }, emit);
      controller.close();
    },
  });

  return new Response(stream, {
    headers: { "Content-Type": "application/x-ndjson", "Cache-Control": "no-store" },
  });
}
