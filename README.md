# Roadie

Roadie is a tour-planning agent for independent musicians. Name an artist and it finds the
cities where their audience is strongest, picks venues that fit, suggests support acts and
brand partners, and routes the run.

Built for the Qloo Agentic Hackathon.

## Why it needs Qloo

A generic LLM can only guess where an audience lives. Roadie's agent works from Qloo's taste
graph, and it cannot submit a tour containing a city, venue, artist or brand that no Qloo tool
returned. The server checks every name and sends invented ones back to the model to fix.

| Agent tool | Qloo source |
| --- | --- |
| `search_artist` | `/search` |
| `similar_artists` | `/v2/insights` with `urn:entity:artist` |
| `rank_cities` | `/v2/insights` with `urn:entity:destination` |
| `find_venues` | `/v2/tags`, then `/v2/insights` with `urn:entity:place` |
| `find_brands` | `/v2/insights` with `urn:entity:brand` |

## Run locally

Requires Node.js 22 or newer.

```bash
npm install
cp .env.example .env.local
npm run dev
```

Open http://localhost:3000.

| Variable | Purpose |
| --- | --- |
| `QLOO_API_KEY` | Live Qloo data. Without it, the app uses clearly labelled sample data. |
| `GEMINI_API_KEY` | Primary LLM provider. |
| `OPENROUTER_API_KEY` | Backup LLM provider. |

With no LLM key, or if every provider fails, Roadie uses a deterministic planner built on the
same tools, and the UI says so. Keys are used only on the server.

## License

MIT
