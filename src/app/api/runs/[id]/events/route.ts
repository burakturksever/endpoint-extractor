import { getRunChannel } from "@/lib/runner/run-store";

interface RouteContext {
  params: Promise<{ id: string }>;
}

export async function GET(_: Request, context: RouteContext): Promise<Response> {
  const { id } = await context.params;
  const channel = getRunChannel(id);
  const encoder = new TextEncoder();
  let onRun: ((payload: unknown) => void) | undefined;
  let onEndpoint: ((payload: unknown) => void) | undefined;
  let heartbeat: ReturnType<typeof setInterval> | undefined;

  const stream = new ReadableStream({
    start(controller) {
      onRun = (payload: unknown) => {
        controller.enqueue(encoder.encode(`event: run\ndata: ${JSON.stringify(payload)}\n\n`));
      };
      onEndpoint = (payload: unknown) => {
        controller.enqueue(encoder.encode(`event: endpoint\ndata: ${JSON.stringify(payload)}\n\n`));
      };
      channel.on("run", onRun);
      channel.on("endpoint", onEndpoint);
      controller.enqueue(encoder.encode("event: ping\ndata: connected\n\n"));

      heartbeat = setInterval(() => {
        controller.enqueue(encoder.encode("event: ping\ndata: heartbeat\n\n"));
      }, 10000);
    },
    cancel() {
      if (heartbeat) {
        clearInterval(heartbeat);
      }
      if (onRun) {
        channel.off("run", onRun);
      }
      if (onEndpoint) {
        channel.off("endpoint", onEndpoint);
      }
    }
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      Connection: "keep-alive"
    }
  });
}
