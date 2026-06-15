# Lumina Chat Extension Documentation

Extensions let you add custom AI tools, UI elements, DOM behaviour patches, and cross-extension events to Lumina Chat. They are written in plain JavaScript and run inside the app with full access to the DOM via tracked, cleanable APIs.

---

## Table of Contents

1. [Getting Started](#1-getting-started)
2. [Extension Structure](#2-extension-structure)
3. [Tools](#3-tools)
   - [Defining a Tool](#31-defining-a-tool)
   - [Input Schema](#32-input-schema)
   - [Tool Context](#33-tool-context)
4. [UI API (`api.ui`)](#4-ui-api-apiui)
   - [Toast Notifications](#41-toast-notifications)
   - [Alert Dialog](#42-alert-dialog)
   - [Confirm Dialog](#43-confirm-dialog)
   - [Prompt Dialog](#44-prompt-dialog)
   - [Rich Modal](#45-rich-modal)
   - [Toolbar Buttons](#46-toolbar-buttons)
   - [Sidebar Sections & Buttons](#47-sidebar-sections--buttons)
5. [DOM API (`api.dom`)](#5-dom-api-apidom)
   - [Event Listeners](#51-event-listeners)
   - [Style Injection](#52-style-injection)
   - [Querying Elements](#53-querying-elements)
   - [MutationObserver](#54-mutationobserver)
   - [Tracked Timers](#55-tracked-timers)
   - [Manual Cleanup Registration](#56-manual-cleanup-registration)
6. [App API (`api.app`)](#6-app-api-apiapp)
   - [Sidebar Control](#61-sidebar-control)
   - [Cross-Extension Events](#62-cross-extension-events)
7. [Cleanup & Lifecycle](#7-cleanup--lifecycle)
8. [Sandbox & Limitations](#8-sandbox--limitations)
9. [Marketplace](#9-marketplace)
10. [Full Examples](#10-full-examples)

---

## 1. Getting Started

Open **Settings → Extensions → New Extension**. The editor opens with a template. Every extension must call `api.registerExtension(...)` to identify itself.

```js

api.registerExtension({
  id: 'hello.world',
  name: 'Hello World',
  version: '1.0.0',
  description: 'My first extension',
  author: 'Your Name',
  tools: [],
});

api.ui.toast('Hello World loaded!', { type: 'success' });
```

Save the extension and it activates immediately. Reload the page to confirm it persists.

---

## 2. Extension Structure

```js
api.registerExtension({
  // Required
  id:          'author.extension-name',   // unique dot-separated ID
  name:        'Display Name',            // shown in the extensions list
  version:     '1.0.0',                   // semver string
  tools:       [],                        // array of tool objects (can be empty)

  // Optional
  description: 'What this extension does',
  author:      'Your Name',
  permissions: [],                        // reserved, currently unused
});
```

### ID format

Extension IDs must match `/^[a-zA-Z0-9._-]+$/`. Use reverse-domain style to avoid collisions: `yourname.toolname`.

---

## 3. Tools

Tools are functions that the AI can call during a conversation (like web search, calculations, or API lookups). Each tool appears in the AI's tool list automatically when the extension is enabled.

### 3.1 Defining a Tool

```js
{
  name: 'get_weather',
  description: 'Get the current weather for a city. Use this when the user asks about weather.',
  inputSchema: { ... },
  async call(args, ctx) {
    // do work
    return { temperature: 22, condition: 'Sunny' };
  }
}
```

The `name` is prefixed with the extension ID when registered so it never conflicts with built-in tools. The `description` is what the AI reads to decide when to call the tool — write it clearly.

### 3.2 Input Schema

`inputSchema` follows a subset of JSON Schema:

```js
inputSchema: {
  type: 'object',
  properties: {
    city: {
      type: 'string',         // 'string' | 'number' | 'boolean'
      description: 'The city name, e.g. "London"',
      enum: ['London', 'Paris', 'Tokyo'],  // optional: restrict to these values
    },
    units: {
      type: 'string',
      description: 'Temperature units',
      enum: ['celsius', 'fahrenheit'],
    },
  },
  required: ['city'],         // list of required property names
}
```

The runtime validates required fields and basic types before calling your tool. If validation fails, the tool throws an error before `call()` runs.

### 3.3 Tool Context

The second argument to `call()` is a context object:

```js
async call(args, ctx) {
  ctx.log('Starting...');      // prints to browser console as [Extension:id]
  ctx.warn('Watch out');
  ctx.error('Something broke');

  ctx.settings;                // read-only AppSettings object (theme, providers, etc.)

  return { result: 'done' };   // return any JSON-serialisable value
}
```

Tools have a **30-second timeout**. If they don't resolve within that time the runtime rejects the call.

---

## 4. UI API

All UI methods are on `api.ui`. They use the app's CSS variables so they automatically match the active theme (light, dark, custom).

### 4.1 Toast Notifications

Non-blocking notification that disappears automatically.

```js
api.ui.toast(message, options?)
```

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `type` | `'info' \| 'success' \| 'warning' \| 'error'` | `'info'` | Color of the toast |
| `duration` | `number` (ms) | `3500` | How long before auto-dismiss. `0` = sticky until manually closed |

```js
api.ui.toast('Saved!', { type: 'success' });
api.ui.toast('Rate limit hit', { type: 'warning', duration: 6000 });
api.ui.toast('Sticky message', { type: 'error', duration: 0 });
```

Toasts appear in the bottom-right corner. Multiple toasts stack vertically. Each has an × button.

---

### 4.2 Alert Dialog

Modal dialog with a single dismiss button. Returns a `Promise<void>` that resolves when the user clicks OK or the backdrop.

```js
await api.ui.alert(message, options?)
```

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `title` | `string` | — | Bold heading above the message |
| `type` | `'info' \| 'success' \| 'warning' \| 'error'` | `'info'` | Icon and accent colour |
| `confirmLabel` | `string` | `'OK'` | Button label |

```js
await api.ui.alert('File saved successfully.', { title: 'Done', type: 'success' });

// Execution continues here after the user clicks OK
doNextThing();
```

---

### 4.3 Confirm Dialog

Modal dialog with Confirm and Cancel buttons. Returns `Promise<boolean>`.

```js
const confirmed = await api.ui.confirm(message, options?)
```

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `title` | `string` | — | Bold heading |
| `type` | `'info' \| 'success' \| 'warning' \| 'error'` | `'info'` | Icon |
| `confirmLabel` | `string` | `'Confirm'` | Primary button label |
| `cancelLabel` | `string` | `'Cancel'` | Secondary button label |

```js
const ok = await api.ui.confirm('Delete this item?', {
  title: 'Confirm Delete',
  type: 'warning',
  confirmLabel: 'Delete',
  cancelLabel: 'Keep',
});

if (ok) {
  // user clicked Delete
}
```

Clicking the backdrop counts as Cancel (`false`).

---

### 4.4 Prompt Dialog

Modal dialog with a text input. Returns `Promise<string | null>`. Returns `null` if the user cancels or closes the backdrop.

```js
const value = await api.ui.prompt(message, options?)
```

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `title` | `string` | — | Bold heading |
| `placeholder` | `string` | — | Input placeholder text |
| `defaultValue` | `string` | `''` | Pre-filled input value |

```js
const name = await api.ui.prompt('What should I call you?', {
  title: 'Name',
  placeholder: 'Jane Doe',
  defaultValue: 'Anonymous',
});

if (name !== null) {
  api.ui.toast(`Hello, ${name}!`, { type: 'success' });
}
```

Press **Enter** to confirm, **Escape** to cancel.

---

### 4.5 Rich Modal

Fully customisable modal with an HTML body and custom footer buttons. Returns a `close()` function.

```js
const close = api.ui.openModal(options)
```

| Option | Type | Required | Description |
|--------|------|----------|-------------|
| `title` | `string` | ✓ | Modal header text |
| `body` | `string` | ✓ | HTML string rendered in the modal body. Scripts and event attributes are stripped automatically. |
| `width` | `'sm' \| 'md' \| 'lg'` | — | `'md'` (default) |
| `buttons` | `Button[]` | — | Footer buttons (see below) |
| `onClose` | `() => void` | — | Called when the modal is dismissed |

**Button shape:**

```js
{ label: string, primary?: boolean, danger?: boolean, onClick: () => void }
```

Each button's `onClick` is called and the modal closes automatically after.

```js
const close = api.ui.openModal({
  title: 'Settings',
  width: 'lg',
  body: `
    <h2>Welcome</h2>
    <p>This modal supports <strong>HTML</strong> content.</p>
    <ul>
      <li>Lists</li>
      <li>Tables</li>
      <li>Headings</li>
    </ul>
  `,
  buttons: [
    {
      label: 'Delete',
      danger: true,
      onClick: () => api.ui.toast('Deleted!', { type: 'error' }),
    },
    {
      label: 'Save',
      primary: true,
      onClick: () => api.ui.toast('Saved!', { type: 'success' }),
    },
    {
      label: 'Cancel',
      onClick: () => {},
    },
  ],
  onClose: () => console.log('modal closed'),
});

// Close programmatically (e.g. after an async operation)
setTimeout(close, 5000);
```

Clicking the backdrop also closes the modal and fires `onClose`.

> **Security:** `<script>` tags, `<style>` tags, and inline event attributes (`onclick`, `onload`, etc.) are stripped from the HTML body before rendering.

---

### 4.6 Toolbar Buttons

Add a button to the chat input toolbar. Returns a `remove()` function.

```js
const remove = api.ui.addButton(options)
```

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `label` | `string` | ✓ | Text label (shown if no icon, or used for accessibility) |
| `icon` | `string` | — | Emoji or short text rendered as the button face |
| `tooltip` | `string` | — | `title` attribute shown on hover |
| `location` | `'chat-toolbar' \| 'sidebar'` | `'chat-toolbar'` | Where the button appears |
| `onClick` | `() => void` | ✓ | Called when clicked |

```js
const remove = api.ui.addButton({
  label: 'Translate',
  icon: '🌐',
  tooltip: 'Translate selection',
  location: 'chat-toolbar',
  onClick: async () => {
    const lang = await api.ui.prompt('Translate to:', { placeholder: 'French' });
    if (lang) api.ui.toast(`Translating to ${lang}…`);
  },
});

// Remove later (e.g. when a setting is toggled off)
remove();
```

When `icon` is provided it is rendered at 15 px. If no icon is given, the `label` text is shown in a small font instead.

---

### 4.7 Sidebar Sections & Buttons

#### `addSidebarSection`

Add a labelled group of items to the bottom of the sidebar (above Providers / Settings). Returns a `remove()` function.

```js
const remove = api.ui.addSidebarSection(options)
```

| Option | Type | Description |
|--------|------|-------------|
| `title` | `string` | Optional section heading (displayed in small caps) |
| `items` | `Item[]` | List of clickable items |

**Item shape:**

```js
{ id: string, label: string, icon?: string, onClick: () => void }
```

```js
const remove = api.ui.addSidebarSection({
  title: 'Snippets',
  items: [
    {
      id: 'new-snippet',
      label: 'New Snippet',
      icon: '✂️',
      onClick: async () => {
        const text = await api.ui.prompt('Snippet content:');
        if (text) api.ui.toast('Snippet saved!', { type: 'success' });
      },
    },
    {
      id: 'view-snippets',
      label: 'View All',
      icon: '📋',
      onClick: () => api.ui.openModal({ title: 'Snippets', body: '<p>No snippets yet.</p>' }),
    },
  ],
});
```

#### `addButton` with `location: 'sidebar'`

For a single standalone button in the sidebar without a section heading, use `addButton` with `location: 'sidebar'`:

```js
api.ui.addButton({
  label: 'Open Dashboard',
  icon: '📊',
  location: 'sidebar',
  onClick: () => { /* ... */ },
});
```

---

## 5. DOM API (`api.dom`)

`api.dom` gives extensions full access to the live DOM. **All side-effects registered through `api.dom` are automatically cleaned up when the extension is disabled or unloaded** — you never need to manually remove listeners or styles.

### 5.1 Event Listeners

```js
// Listen on any EventTarget
const remove = api.dom.on(target, eventType, handler, options?)

// Shorthands
const remove = api.dom.onDocument(eventType, handler, options?)
const remove = api.dom.onWindow(eventType, handler, options?)
```

`remove()` is returned if you want to remove the listener early. Otherwise it's removed automatically on extension unload.

```js
// Log every keydown
api.dom.onDocument('keydown', (e) => {
  console.log('key:', e.key);
});

// Listen to window resize
api.dom.onWindow('resize', () => {
  console.log('viewport width:', window.innerWidth);
});

// Listen on a specific element
const sidebar = api.dom.query('[data-tour="sidebar"]');
if (sidebar) {
  api.dom.on(sidebar, 'mouseleave', () => api.app.sidebar.collapse());
}
```

### 5.2 Style Injection

```js
const remove = api.dom.addStyle(cssString)
```

Injects a `<style>` tag into `<head>`. Removed automatically on unload.

```js
api.dom.addStyle(`
  .chat-input-box {
    border-radius: 24px !important;
  }
  .sidebar-item:hover {
    background: rgba(255,255,255,0.08) !important;
  }
`);
```

### 5.3 Querying Elements

```js
api.dom.query(selector)    // → Element | null  (live, no tracking needed)
api.dom.queryAll(selector) // → Element[]
```

These are plain `document.querySelector` / `querySelectorAll` calls — no cleanup needed since they don't register anything.

```js
const input = api.dom.query('[data-tour="chat-input"]');
const buttons = api.dom.queryAll('.toolbar-btn');
console.log(`${buttons.length} toolbar buttons found`);
```

### 5.4 MutationObserver

```js
const disconnect = api.dom.observe(target, callback, options)
```

Wraps `MutationObserver`. The observer is disconnected automatically on unload.

```js
api.dom.observe(document.body, (mutations) => {
  for (const m of mutations) {
    if (m.addedNodes.length) console.log('nodes added:', m.addedNodes);
  }
}, { childList: true, subtree: true });
```

### 5.5 Tracked Timers

Standard `setInterval` / `setTimeout` but registered for automatic cleanup:

```js
const clear = api.dom.setInterval(fn, ms)  // → clearInterval() function
const clear = api.dom.setTimeout(fn, ms)   // → clearTimeout() function
```

```js
// Poll something every 10 seconds
api.dom.setInterval(() => {
  const el = api.dom.query('.unread-badge');
  if (el) api.ui.toast(`${el.textContent} unread`, { type: 'info' });
}, 10_000);
```

### 5.6 Manual Cleanup Registration

Register any cleanup function to run when the extension is disabled or unloaded:

```js
api.dom.onCleanup(fn)
```

```js
const myThing = startSomething();
api.dom.onCleanup(() => myThing.stop());
```

---

## 6. App API (`api.app`)

`api.app` provides control over high-level app behaviour.

### 6.1 Sidebar Control

```js
api.app.sidebar.collapse()              // collapse the sidebar
api.app.sidebar.expand()               // expand the sidebar
api.app.sidebar.toggle()               // toggle
api.app.sidebar.isCollapsed()          // → boolean
api.app.sidebar.onChange(fn)           // listen for state changes, returns remove()
```

**Example — auto-hide sidebar on mouse leave, reveal on hover near left edge:**

```js
const EDGE_PX = 40; // how close to the left edge to trigger open

api.app.sidebar.collapse();

// Open when mouse is near the left edge
api.dom.onDocument('mousemove', (e) => {
  if (e.clientX <= EDGE_PX && api.app.sidebar.isCollapsed()) {
    api.app.sidebar.expand();
  }
});

// Collapse when mouse leaves the sidebar
const sidebar = api.dom.query('[data-tour="sidebar"]');
if (sidebar) {
  api.dom.on(sidebar, 'mouseleave', (e) => {
    // Only collapse if the mouse left to the right (into chat area)
    if (e.clientX > EDGE_PX) api.app.sidebar.collapse();
  });
}

// Listen for state changes
api.app.sidebar.onChange((collapsed) => {
  console.log('sidebar is now', collapsed ? 'hidden' : 'visible');
});
```

When the extension is disabled the sidebar event listeners are cleaned up automatically and the sidebar returns to its previous behavior.

### 6.2 Cross-Extension Events

Extensions can communicate with each other through a simple pub/sub system:

```js
// Emit an event (other extensions can listen)
api.app.emit('eventName', { any: 'data' })

// Listen for an event from any extension
const unlisten = api.app.on('eventName', (detail) => {
  console.log(detail); // { any: 'data' }
})
```

Events are namespaced internally to `lumina:ext:*` so they never clash with browser events. Listeners registered via `api.app.on` are cleaned up automatically on unload.

```js
// extension A — publisher
api.dom.setInterval(() => {
  api.app.emit('tick', { time: Date.now() });
}, 1000);

// extension B — subscriber
api.app.on('tick', ({ time }) => {
  console.log('tick from extension A at', time);
});
```

---

## 7. Cleanup & Lifecycle

Every `api.dom.*` call and `api.app.on` / `api.app.sidebar.onChange` registers a cleanup function internally. When an extension is **disabled**, **deleted**, or the page is **reloaded with the extension off**, all of the following happen automatically:

| Registered via | Cleaned up by |
|----------------|---------------|
| `api.dom.on` / `onDocument` / `onWindow` | `removeEventListener` |
| `api.dom.addStyle` | `<style>` tag removed from DOM |
| `api.dom.observe` | `MutationObserver.disconnect()` |
| `api.dom.setInterval` / `setTimeout` | `clearInterval` / `clearTimeout` |
| `api.dom.onCleanup(fn)` | `fn()` called |
| `api.ui.addButton` | button removed from toolbar/sidebar |
| `api.ui.addSidebarSection` | section removed from sidebar |
| `api.app.on` / `sidebar.onChange` | `removeEventListener` |

You do **not** need to call any remove/cleanup functions yourself unless you want to tear down something early.

---

## 8. Sandbox & Limitations

Extensions run inside `new Function(...)`. The following globals are **intentionally not blocked** at the sandbox level — instead, the `api.dom` wrappers are the recommended way to access the DOM because all side-effects registered through `api.dom` are automatically cleaned up when the extension is disabled.

| Available via `api.dom` | Direct access? |
|-------------------------|----------------|
| `document`, `window` event listeners | Use `api.dom.on/onDocument/onWindow` |
| CSS injection | Use `api.dom.addStyle` |
| DOM queries | `api.dom.query / queryAll` (or use `document.querySelector` directly) |
| `setInterval` / `setTimeout` | Use `api.dom.setInterval / setTimeout` (auto-cancelled) |

The following globals are explicitly **blocked** as they provide no legitimate extension use case:

| Blocked | Reason |
|---------|--------|
| `eval`, `Function` | Prevent code injection |
| `fetch`, `XMLHttpRequest`, `WebSocket` | Network access is restricted |
| `localStorage`, `sessionStorage`, `indexedDB` | Storage is scoped to the host app |
| `crypto`, `navigator`, `location`, `history` | Sensitive browser APIs |
| `process`, `require`, `import`, `global` | Node/module globals |

The following **are available** as plain globals:

`Object`, `Array`, `String`, `Number`, `Boolean`, `Date`, `Math`, `JSON`, `Promise`, `setTimeout` (capped at 30 s), `clearTimeout`, `setInterval`, `clearInterval`

**Tool timeout:** Each tool call has a hard 30-second timeout.

**Code size limit:** Extension code submitted to the marketplace is capped at 512 KB.

---

## 9. Marketplace

The Extension Marketplace is at `/marketplace`. It requires a free account.

### Publishing an extension

1. Go to `/marketplace` and sign up or sign in.
2. Click the **Submit** tab.
3. Fill in the ID, name, version, author, description, and paste your code.
4. Click **Submit for Review**.

Extensions are reviewed by a moderator before they appear publicly. You will see your submission under **My Extensions** with a status of *Pending review*, *Approved*, or *Rejected* (with a reviewer note if rejected).

### Installing from the marketplace

1. Browse the **Browse** tab — no account needed.
2. Click **Install** on any extension.
3. The extension is saved locally and activated immediately. You can manage it in Settings → Extensions like any other extension.

### Moderator accounts

Moderator usernames are configured via the `MARKETPLACE_MOD_USERNAMES` environment variable on the server (comma-separated). Any account registered with a matching username automatically receives the moderator role and sees the **Review** tab, where pending submissions can be approved or rejected with an optional note to the author.

---

## 10. Full Examples

### 10.1 Word Counter (UI + Tool)

A complete extension that adds a sidebar button, prompts the user, and shows a results modal, plus an AI-callable tool:

```js

api.registerExtension({
  id: 'demo.word-counter',
  name: 'Word Counter',
  version: '1.0.0',
  description: 'Count words in any text via a sidebar button or AI tool',
  author: 'Demo',
  tools: [
    {
      name: 'count_words',
      description: 'Count the number of words, sentences, and characters in a given text.',
      inputSchema: {
        type: 'object',
        properties: {
          text: { type: 'string', description: 'The text to analyse' },
        },
        required: ['text'],
      },
      async call({ text }, ctx) {
        const words     = text.trim().split(/\s+/).filter(Boolean).length;
        const sentences = text.split(/[.!?]+/).filter(Boolean).length;
        const chars     = text.length;
        ctx.log(`Counted: ${words} words`);
        return { words, sentences, characters: chars };
      },
    },
  ],
});

function showResults(text) {
  const words     = text.trim().split(/\s+/).filter(Boolean).length;
  const sentences = text.split(/[.!?]+/).filter(Boolean).length;
  const chars     = text.length;

  api.ui.openModal({
    title: 'Word Count Results',
    width: 'sm',
    body: `
      <table style="width:100%;border-collapse:collapse">
        <tr>
          <td style="padding:6px 0;color:var(--muted)">Words</td>
          <td style="text-align:right;font-weight:600">${words}</td>
        </tr>
        <tr>
          <td style="padding:6px 0;color:var(--muted)">Sentences</td>
          <td style="text-align:right;font-weight:600">${sentences}</td>
        </tr>
        <tr>
          <td style="padding:6px 0;color:var(--muted)">Characters</td>
          <td style="text-align:right;font-weight:600">${chars}</td>
        </tr>
      </table>
    `,
    buttons: [{ label: 'Close', primary: true, onClick: () => {} }],
  });
}

// Sidebar section with a prompt → modal flow
api.ui.addSidebarSection({
  title: 'Word Counter',
  items: [
    {
      id: 'count-words',
      label: 'Count Words',
      icon: '🔢',
      onClick: async () => {
        const text = await api.ui.prompt('Paste your text below:', {
          title: 'Word Counter',
          placeholder: 'Type or paste text here…',
        });
        if (text) showResults(text);
      },
    },
  ],
});

// Toolbar button for quick access
api.ui.addButton({
  label: 'Count',
  icon: '🔢',
  tooltip: 'Count words in text',
  location: 'chat-toolbar',
  onClick: async () => {
    const text = await api.ui.prompt('Paste text to count:');
    if (text) showResults(text);
  },
});

api.ui.toast('Word Counter ready', { type: 'success', duration: 2000 });
```

### 10.2 Auto-Collapse Sidebar on Mouse Leave

Bypasses React state entirely — directly controls the sidebar DOM element with injected CSS transitions for a smooth slide. Also injects a **pin button** next to the cloud sync icon so the user can lock the sidebar open. Requires **Unsandboxed** mode.

```js

api.sandbox.requireUnsandboxed('sidebar.auto-collapse requires Unsandboxed mode for direct DOM control.');

api.registerExtension({
  id: 'sidebar.auto-collapse',
  name: 'Auto-Collapse Sidebar',
  version: '1.0.0',
  description: 'Slides the sidebar in/out via direct DOM control. Pin button locks it open.',
  author: 'Demo',
  tools: [],
});

const EDGE_PX = 48;
let pinned = false;

// ── Styles ────────────────────────────────────────────────────────────────
api.dom.addStyle(`
  [data-tour="sidebar"] {
    transition:
      width 240ms cubic-bezier(0.4, 0, 0.2, 1),
      min-width 240ms cubic-bezier(0.4, 0, 0.2, 1),
      opacity 180ms ease !important;
    overflow: hidden !important;
    min-width: 0 !important;
  }
  [data-tour="sidebar"].ext-sidebar-collapsed {
    width: 0 !important;
    opacity: 0 !important;
    pointer-events: none !important;
  }

  /* Pin button */
  #ext-sidebar-pin {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 24px;
    height: 24px;
    border-radius: 6px;
    border: none;
    background: transparent;
    cursor: pointer;
    color: rgb(var(--muted));
    transition: color 120ms ease, background 120ms ease;
    flex-shrink: 0;
  }
  #ext-sidebar-pin:hover {
    background: rgb(var(--border) / 0.6);
    color: rgb(var(--text));
  }
  #ext-sidebar-pin.pinned {
    color: rgb(var(--accent));
  }
`);

// ── Sidebar collapse helpers ──────────────────────────────────────────────
const sidebar = api.dom.query('[data-tour="sidebar"]');

const collapse    = () => { if (!pinned) sidebar?.classList.add('ext-sidebar-collapsed'); };
const expand      = () => sidebar?.classList.remove('ext-sidebar-collapsed');
const isCollapsed = () => sidebar?.classList.contains('ext-sidebar-collapsed') ?? false;

// ── Pin button ────────────────────────────────────────────────────────────
// The sidebar header is the first child of the sidebar with a border-b.
// Insert a pin button right before the collapse/close buttons.
const header = sidebar?.querySelector('.border-b');
if (header) {
  const pin = document.createElement('button');
  pin.id = 'ext-sidebar-pin';
  pin.title = 'Pin sidebar open';
  pin.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24"
    fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
    <line x1="12" y1="17" x2="12" y2="22"/><path d="M5 17h14v-1.76a2 2 0 0 0-1.11-1.79l-1.78-.9A2 2 0 0 1 15 10.76V6h1a2 2 0 0 0 0-4H8a2 2 0 0 0 0 4h1v4.76a2 2 0 0 1-1.11 1.79l-1.78.9A2 2 0 0 0 5 15.24Z"/>
  </svg>`;

  pin.addEventListener('click', () => {
    pinned = !pinned;
    pin.classList.toggle('pinned', pinned);
    pin.title = pinned ? 'Unpin sidebar' : 'Pin sidebar open';
    if (pinned) expand();
  });

  // Insert before the last two buttons (collapse + close)
  const buttons = header.querySelectorAll('button');
  const insertBefore = buttons[buttons.length - 2] ?? null;
  header.insertBefore(pin, insertBefore);

  api.dom.onCleanup(() => pin.remove());
}

// ── Behaviour ─────────────────────────────────────────────────────────────
collapse();

api.dom.onDocument('mousemove', (e) => {
  if (e.clientX <= EDGE_PX && isCollapsed()) expand();
});

if (sidebar) {
  api.dom.on(sidebar, 'mouseleave', (e) => {
    if (e.clientX > EDGE_PX) collapse();
  });
}

api.dom.onCleanup(expand);
```

### 10.3 Injecting a Custom CSS Theme Patch

```js

api.registerExtension({
  id: 'theme.rounded-inputs',
  name: 'Rounded Inputs',
  version: '1.0.0',
  description: 'Makes chat input and buttons fully pill-shaped.',
  author: 'Demo',
  tools: [],
});

api.dom.addStyle(`
  [data-tour="chat-input"] {
    border-radius: 9999px !important;
    padding-left: 1.25rem !important;
    padding-right: 1.25rem !important;
  }
  button[type="submit"] {
    border-radius: 9999px !important;
  }
`);
// Style is automatically removed when the extension is disabled.
```
