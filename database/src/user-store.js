const CHUNK_SIZE = 1_800_000; // ~1.8MB per chunk

export class UserStore {
  constructor(ctx, env) {
    this.ctx = ctx;
    this.env = env;
    this.sessions = new Set();

    this.ctx.storage.sql.exec(`
      CREATE TABLE IF NOT EXISTS store (
        key   TEXT PRIMARY KEY,
        value TEXT NOT NULL
      )
    `);

    // Auto-migrate any legacy oversized rows on startup
    this._migrateAll();
  }

  // --- Chunk helpers ---

  _getChunkCount(key) {
    const meta = [...this.ctx.storage.sql.exec(
      "SELECT value FROM store WHERE key = ?", `${key}__chunks`
    )][0];
    return meta ? parseInt(meta.value, 10) : null; // null = single-row (legacy or small)
  }

  _read(key) {
    const chunkCount = this._getChunkCount(key);

    if (chunkCount !== null) {
      let assembled = "";
      for (let i = 1; i <= chunkCount; i++) {
        const row = [...this.ctx.storage.sql.exec(
          "SELECT value FROM store WHERE key = ?", `${key}_${i}`
        )][0];
        if (row) assembled += row.value;
      }
      return assembled;
    }

    const row = [...this.ctx.storage.sql.exec(
      "SELECT value FROM store WHERE key = ?", key
    )][0];
    return row ? row.value : null;
  }

  _write(key, value) {
    const existingChunkCount = this._getChunkCount(key);
    const neededChunks = Math.ceil(value.length / CHUNK_SIZE);

    if (neededChunks === 1) {
      // Fits in a single row — store directly, clean up any old chunks
      if (existingChunkCount !== null) {
        for (let i = 1; i <= existingChunkCount; i++) {
          this.ctx.storage.sql.exec("DELETE FROM store WHERE key = ?", `${key}_${i}`);
        }
        this.ctx.storage.sql.exec("DELETE FROM store WHERE key = ?", `${key}__chunks`);
      }
      this.ctx.storage.sql.exec(
        "INSERT INTO store (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value",
        key, value
      );
    } else {
      // Needs multiple chunks — remove plain row if it existed (legacy)
      this.ctx.storage.sql.exec("DELETE FROM store WHERE key = ?", key);

      // Write only the chunks we actually need
      for (let i = 1; i <= neededChunks; i++) {
        const chunk = value.slice((i - 1) * CHUNK_SIZE, i * CHUNK_SIZE);
        this.ctx.storage.sql.exec(
          "INSERT INTO store (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value",
          `${key}_${i}`, chunk
        );
      }

      // Remove any now-unneeded trailing chunks from a previous larger write
      if (existingChunkCount !== null && existingChunkCount > neededChunks) {
        for (let i = neededChunks + 1; i <= existingChunkCount; i++) {
          this.ctx.storage.sql.exec("DELETE FROM store WHERE key = ?", `${key}_${i}`);
        }
      }

      // Update chunk count meta
      this.ctx.storage.sql.exec(
        "INSERT INTO store (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value",
        `${key}__chunks`, String(neededChunks)
      );
    }
  }

  _delete(key) {
    const chunkCount = this._getChunkCount(key);
    if (chunkCount !== null) {
      for (let i = 1; i <= chunkCount; i++) {
        this.ctx.storage.sql.exec("DELETE FROM store WHERE key = ?", `${key}_${i}`);
      }
      this.ctx.storage.sql.exec("DELETE FROM store WHERE key = ?", `${key}__chunks`);
    } else {
      this.ctx.storage.sql.exec("DELETE FROM store WHERE key = ?", key);
    }
  }

  /**
   * Returns all logical keys hiding internal chunk rows.
   */
  _getAll() {
    const rows = [...this.ctx.storage.sql.exec("SELECT key, value FROM store")];

    const chunkedKeys = new Set(
      rows
        .filter(r => r.key.endsWith("__chunks"))
        .map(r => r.key.slice(0, -"__chunks".length))
    );

    const result = {};

    for (const row of rows) {
      if (row.key.endsWith("__chunks")) continue;
      const ownerKey = [...chunkedKeys].find(k => row.key.startsWith(`${k}_`) && /^_\d+$/.test(row.key.slice(k.length)));
      if (ownerKey) continue; // skip raw chunk rows

      result[row.key] = row.value; // plain single-row value
    }

    for (const key of chunkedKeys) {
      result[key] = this._read(key); // assembled chunked value
    }

    return result;
  }

  /**
   * On startup: migrate any legacy single-row entries that exceed CHUNK_SIZE.
   * Skips rows that are already chunked or are small enough to stay as-is.
   */
  _migrateAll() {
    const rows = [...this.ctx.storage.sql.exec("SELECT key, value FROM store")];

    const chunkedKeys = new Set(
      rows
        .filter(r => r.key.endsWith("__chunks"))
        .map(r => r.key.slice(0, -"__chunks".length))
    );

    for (const row of rows) {
      // Skip internal rows
      if (row.key.endsWith("__chunks")) continue;
      // Skip rows that are already part of the chunk system
      if (chunkedKeys.has(row.key)) continue;
      const isChunkRow = [...chunkedKeys].some(
        k => row.key.startsWith(`${k}_`) && /^_\d+$/.test(row.key.slice(k.length))
      );
      if (isChunkRow) continue;
      // Only migrate if it actually exceeds the chunk size
      if (row.value.length > CHUNK_SIZE) {
        this._write(row.key, row.value);
      }
    }
  }

  // --- WebSocket handler ---

  async fetch(request) {
    if (request.headers.get("Upgrade") !== "websocket") {
      return new Response("Expected WebSocket", { status: 426 });
    }

    const [client, server] = Object.values(new WebSocketPair());
    server.accept();
    this.sessions.add(server);

    server.send(JSON.stringify({ type: "init", data: this._getAll() }));

    server.addEventListener("message", (event) => {
      let msg;
      try { msg = JSON.parse(event.data); }
      catch { server.send(JSON.stringify({ type: "error", message: "Invalid JSON" })); return; }

      if (msg.type === "set" && msg.key && msg.value !== undefined) {
        this._write(msg.key, msg.value);
        const update = JSON.stringify({ type: "update", key: msg.key, value: msg.value });
        for (const session of this.sessions) {
          try { session.send(update); } catch { this.sessions.delete(session); }
        }
      }

      else if (msg.type === "get" && msg.key) {
        server.send(JSON.stringify({ type: "value", key: msg.key, value: this._read(msg.key) }));
      }

      else if (msg.type === "delete" && msg.key) {
        this._delete(msg.key);
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