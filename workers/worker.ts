import { NotebookDO } from "./notebook_do";

export interface Env {
  NOTEBOOK_DO: DurableObjectNamespace<NotebookDO>;
  COLLAB_AUTH_TOKEN?: string;
}

export { NotebookDO };

function withCors(response: Response): Response {
  const res = new Response(response.body, response);
  res.headers.set("Access-Control-Allow-Origin", "*");
  res.headers.set(
    "Access-Control-Allow-Headers",
    "Content-Type, Upgrade, Sec-WebSocket-Protocol"
  );
  res.headers.set("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  return res;
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);
    const isWebSocket =
      (request.headers.get("Upgrade") ?? "").toLowerCase() === "websocket";

    if (request.method === "OPTIONS") {
      return withCors(new Response(null, { status: 204 }));
    }

    if (url.pathname === "/api/health") {
      return withCors(new Response("ok", { status: 200 }));
    }

    const parts = url.pathname.split("/").filter(Boolean);
    if (parts[0] === "ws" && parts[1]) {
      const requiredToken = env.COLLAB_AUTH_TOKEN?.trim();
      if (requiredToken) {
        const provided = url.searchParams.get("token") || "";
        if (provided !== requiredToken) {
          return withCors(new Response("Unauthorized", { status: 401 }));
        }
      }

      const notebookId = parts[1];
      const id = env.NOTEBOOK_DO.idFromName(notebookId);
      const stub = env.NOTEBOOK_DO.get(id);
      const response = await stub.fetch(request);
      // WebSockets don't use CORS; only attach CORS headers for HTTP fetches (e.g. /snapshot).
      if (isWebSocket) return response;
      return withCors(response);
    }

    return withCors(
      new Response(
        JSON.stringify({
          ok: true,
          message:
            "This is the collaboration Worker (WebSocket API). Deploy the frontend separately (e.g. Cloudflare Pages) and connect to /ws/:notebookId.",
          endpoints: {
            health: "/api/health",
            websocket: "/ws/:notebookId",
          },
        }),
        {
          status: 200,
          headers: { "content-type": "application/json" },
        }
      )
    );
  },
};
