export { UserStore } from './user-store.js';

export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    if (url.pathname === "/ws") {
      const userId = url.searchParams.get("userId");
      if (!userId) return new Response("Missing userId", { status: 400 });

      const id = env.CHAT_USER.idFromName(userId);
      const stub = env.CHAT_USER.get(id);
      return stub.fetch(request);
    }

    return new Response("Not found", { status: 404 });
  }
};