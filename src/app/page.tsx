"use client";

import { useState, type FormEvent } from "react";
import type { AgentEvent, Plan } from "../lib/agent";

const COUNTRIES = [
  ["US", "United States"],
  ["GB", "United Kingdom"],
  ["CA", "Canada"],
  ["AU", "Australia"],
  ["DE", "Germany"],
  ["JP", "Japan"],
  ["VN", "Vietnam"],
];

export default function Home() {
  const [artist, setArtist] = useState("");
  const [country, setCountry] = useState("US");
  const [stops, setStops] = useState(4);
  const [steps, setSteps] = useState<string[]>([]);
  const [plan, setPlan] = useState<Plan>();
  const [error, setError] = useState<string>();
  const [busy, setBusy] = useState(false);

  async function submit(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setSteps([]);
    setPlan(undefined);
    setError(undefined);

    const handle = (update: AgentEvent) => {
      if (update.type === "step") setSteps((list) => [...list, update.label]);
      if (update.type === "plan") setPlan(update.plan);
      if (update.type === "error") setError(update.message);
    };

    try {
      const res = await fetch("/api/plan", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ artist, country, stops }),
      });
      if (!res.ok || !res.body) throw new Error(`Request failed (${res.status})`);

      const reader = res.body.pipeThrough(new TextDecoderStream()).getReader();
      let buffer = "";
      for (;;) {
        const { value, done } = await reader.read();
        if (done) break;
        buffer += value;
        const lines = buffer.split("\n");
        buffer = lines.pop() ?? "";
        for (const line of lines) if (line) handle(JSON.parse(line));
      }
    } catch (failure) {
      setError((failure as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <main>
      <header>
        <p className="eyebrow">Tour planning, grounded in real taste</p>
        <h1>Roadie</h1>
        <p className="lede">
          Name an artist. Roadie finds where their audience really is, books the rooms that fit,
          and routes the run.
        </p>
      </header>

      <form onSubmit={submit}>
        <label className="grow">
          Artist
          <input
            value={artist}
            onChange={(event) => setArtist(event.target.value)}
            placeholder="e.g. Khruangbin"
            maxLength={80}
            required
          />
        </label>
        <label>
          Country
          <select value={country} onChange={(event) => setCountry(event.target.value)}>
            {COUNTRIES.map(([code, name]) => (
              <option key={code} value={code}>
                {name}
              </option>
            ))}
          </select>
        </label>
        <label>
          Stops
          <input
            type="number"
            min={2}
            max={6}
            value={stops}
            onChange={(event) => setStops(Number(event.target.value))}
          />
        </label>
        <button disabled={busy}>{busy ? "Planning…" : "Plan the tour"}</button>
      </form>

      {steps.length > 0 && (
        <ol className="steps" aria-live="polite">
          {steps.map((step, i) => (
            <li key={i}>{step}</li>
          ))}
        </ol>
      )}

      {error && <p className="error">{error}</p>}
      {plan && <Tour plan={plan} />}
    </main>
  );
}

function Tour({ plan }: { plan: Plan }) {
  return (
    <section className="tour">
      {plan.data === "sample" && (
        <p className="notice">Sample data: no Qloo key is configured, so these results are not real.</p>
      )}
      {plan.planner === "deterministic" && (
        <p className="notice">Planned by the deterministic fallback, not the AI agent.</p>
      )}

      <h2>{plan.artist}</h2>
      <p>{plan.summary}</p>
      {plan.totalKm && <p className="meta">{plan.totalKm.toLocaleString("en-US")} km on the road</p>}

      <ol className="stops">
        {plan.stops.map((stop, i) => (
          <li key={stop.city}>
            <span className="index">{String(i + 1).padStart(2, "0")}</span>
            <div>
              <h3>{stop.city}</h3>
              <p className="venue">
                {stop.venue}
                {stop.address && <small>{stop.address}</small>}
              </p>
              {stop.support && <p>With {stop.support}</p>}
              <p className="why">{stop.why}</p>
            </div>
            <div className="numbers">
              {stop.affinity !== undefined && <span>{Math.round(stop.affinity * 100)}% match</span>}
              {stop.kmFromPrevious !== undefined && <span>{stop.kmFromPrevious} km</span>}
            </div>
          </li>
        ))}
      </ol>

      {plan.brands.length > 0 && (
        <>
          <h2>Brand partners</h2>
          <ul className="brands">
            {plan.brands.map((brand) => (
              <li key={brand.name}>
                <strong>{brand.name}</strong> {brand.why}
              </li>
            ))}
          </ul>
        </>
      )}
    </section>
  );
}
