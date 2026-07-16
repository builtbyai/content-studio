// ScheduleRoom Durable Object — one instance per user, holds the set of live
// SSE subscribers and fan-outs status events from webhook handlers and the
// queue consumer. Survives connection blips via standard SSE reconnect.

export class ScheduleRoom {
  private subscribers = new Set<WritableStreamDefaultWriter<Uint8Array>>();

  constructor(_state: DurableObjectState, _env: unknown) {}

  async fetch(request: Request): Promise<Response> {
    const url = new URL(request.url);

    if (url.pathname === "/subscribe") {
      return this.subscribe();
    }
    if (url.pathname === "/broadcast" && request.method === "POST") {
      const body = await request.text();
      await this.broadcast(body);
      return new Response(JSON.stringify({ delivered: this.subscribers.size }), {
        headers: { "content-type": "application/json" },
      });
    }
    return new Response("not found", { status: 404 });
  }

  private subscribe(): Response {
    const { readable, writable } = new TransformStream<Uint8Array, Uint8Array>();
    const writer = writable.getWriter();
    this.subscribers.add(writer);

    // SSE preamble + initial comment to flush.
    const enc = new TextEncoder();
    writer.write(enc.encode(`: connected\n\n`)).catch(() => this.subscribers.delete(writer));

    // Heartbeat every 25s — keeps Cloudflare from idling the stream.
    const hb = setInterval(() => {
      writer.write(enc.encode(`: hb\n\n`)).catch(() => {
        clearInterval(hb);
        this.subscribers.delete(writer);
      });
    }, 25_000);

    return new Response(readable, {
      headers: {
        "content-type": "text/event-stream",
        "cache-control": "no-cache, no-transform",
        "x-accel-buffering": "no",
      },
    });
  }

  private async broadcast(payload: string): Promise<void> {
    // Event name comes from payload.type when present; defaults to `schedule`
    // for backwards compatibility with existing Generations + Scheduler hooks.
    let eventName = "schedule";
    try {
      const parsed = JSON.parse(payload) as { type?: string };
      if (parsed && typeof parsed.type === "string" && /^[a-z_]+$/.test(parsed.type)) {
        eventName = parsed.type;
      }
    } catch { /* malformed payload — fall back to schedule */ }

    const enc = new TextEncoder();
    const chunk = enc.encode(`event: ${eventName}\ndata: ${payload}\n\n`);
    const dead: WritableStreamDefaultWriter<Uint8Array>[] = [];
    for (const w of this.subscribers) {
      try {
        await w.write(chunk);
      } catch {
        dead.push(w);
      }
    }
    for (const w of dead) this.subscribers.delete(w);
  }
}
