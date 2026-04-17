export class UserStore {
  constructor(ctx, env) {
    this.ctx = ctx;
    this.env = env;
    this.sessions = new Set(); // track all connected WebSocket clients

    // Create storage table
    this.ctx.storage.sql.exec(`
      CREATE TABLE IF NOT EXISTS store (
        key   TEXT PRIMARY KEY,
        value TEXT NOT NULL
      )
    `);
  }

  async fetch(request) {
    if (request.headers.get("Upgrade") !== "websocket") {
      return new Response("Expected WebSocket", { status: 426 });
    }

    const [client, server] = Object.values(new WebSocketPair());
    server.accept();

    // Add this client to the session pool
    this.sessions.add(server);

    // Send all current stored data to the newly connected client
    const rows = [...this.ctx.storage.sql.exec("SELECT key, value FROM store")];
    server.send(JSON.stringify({ type: "init", data: Object.fromEntries(rows.map(r => [r.key, r.value])) }));

    server.addEventListener("message", (event) => {
      let msg;
      try { msg = JSON.parse(event.data); }
      catch { server.send(JSON.stringify({ type: "error", message: "Invalid JSON" })); return; }

      // SET: store a value and broadcast to all other clients
      if (msg.type === "set" && msg.key && msg.value !== undefined) {
        this.ctx.storage.sql.exec(
          "INSERT INTO store (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value",
          msg.key, msg.value
        );
        // Broadcast update to ALL connected clients (including sender)
        const update = JSON.stringify({ type: "update", key: msg.key, value: msg.value });
        for (const session of this.sessions) {
          try { session.send(update); } catch { this.sessions.delete(session); }
        }
      }

      // GET: retrieve a single value
      else if (msg.type === "get" && msg.key) {
        const row = [...this.ctx.storage.sql.exec("SELECT value FROM store WHERE key = ?", msg.key)][0];
        server.send(JSON.stringify({ type: "value", key: msg.key, value: row ? row.value : null }));
      }

      // DELETE: remove a key and broadcast
      else if (msg.type === "delete" && msg.key) {
        this.ctx.storage.sql.exec("DELETE FROM store WHERE key = ?", msg.key);
        const update = JSON.stringify({ type: "deleted", key: msg.key });
        for (const session of this.sessions) {
          try { session.send(update); } catch { this.sessions.delete(session); }
        }
      }
    });

    server.addEventListener("close", () => {
      this.sessions.delete(server);
    });

    return new Response(null, { status: 101, webSocket: client });
  }
}