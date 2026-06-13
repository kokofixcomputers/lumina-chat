import { useState, useRef, useCallback, useEffect } from 'react';
import { Monitor, Plus, StopCircle, ShieldAlert } from 'lucide-react';
import { v4 as uuidv4 } from 'uuid';
import type { CoworkSession } from '../utils/coworkSessionDB';
import type { Message } from '../types';
import { useAppStore } from '../hooks/useAppStore';
import { universalFetch } from '../utils/tauriFetch';
import { resolveFormat } from './ProvidersPanel';
import ChatArea from './ChatArea';

const COWORK_TOOLS = [
  {
    name: 'take_screenshot',
    description: 'Capture the current state of the user\'s screen. Always do this first before taking any action, and after each action to verify the result.',
    input_schema: { type: 'object', properties: {}, required: [] },
  },
  {
    name: 'move_mouse',
    description: 'Move the mouse cursor to an absolute pixel position on screen.',
    input_schema: {
      type: 'object',
      properties: {
        x: { type: 'integer', description: 'X coordinate in pixels' },
        y: { type: 'integer', description: 'Y coordinate in pixels' },
      },
      required: ['x', 'y'],
    },
  },
  {
    name: 'click',
    description: 'Click the mouse at a position. Use "left" for normal clicks, "right" for context menus, "double" for opening items.',
    input_schema: {
      type: 'object',
      properties: {
        x: { type: 'integer', description: 'X coordinate in pixels' },
        y: { type: 'integer', description: 'Y coordinate in pixels' },
        button: { type: 'string', enum: ['left', 'right', 'double'], description: 'Which mouse button to click (default: left)' },
      },
      required: ['x', 'y'],
    },
  },
  {
    name: 'type_text',
    description: 'Type text at the current cursor position using the keyboard.',
    input_schema: {
      type: 'object',
      properties: {
        text: { type: 'string', description: 'Text to type' },
      },
      required: ['text'],
    },
  },
  {
    name: 'key_press',
    description: 'Press a key or keyboard shortcut. For shortcuts, press modifier keys first (cmd, ctrl, shift, alt), then the character.',
    input_schema: {
      type: 'object',
      properties: {
        key: { type: 'string', description: 'Key or shortcut to press. Single keys: return, escape, tab, space, backspace, delete, up, down, left, right, cmd, ctrl, alt, shift, f1–f12, or a single character. Combos: join with +, e.g. "cmd+space", "cmd+c", "ctrl+shift+t", "cmd+shift+4".' },
      },
      required: ['key'],
    },
  },
  {
    name: 'scroll',
    description: 'Scroll at a screen position.',
    input_schema: {
      type: 'object',
      properties: {
        x: { type: 'integer' },
        y: { type: 'integer' },
        direction: { type: 'string', enum: ['up', 'down', 'left', 'right'] },
        amount: { type: 'integer', description: 'Scroll units (default 3)' },
      },
      required: ['x', 'y', 'direction'],
    },
  },
];

const SYSTEM_PROMPT = `You are a computer control assistant. You can control the user's Mac with mouse, keyboard, and screen capture tools.

CRITICAL RULES — follow these exactly:
1. When asked to press a key or type something, call key_press or type_text IMMEDIATELY. Do NOT take a screenshot first.
2. When asked to click somewhere, call click IMMEDIATELY. Do NOT take a screenshot first.
3. Only call take_screenshot when you need to locate something on screen (e.g. finding coordinates to click). If the user gives you coordinates or a clear instruction like "press cmd+space", execute it directly.
4. NEVER call take_screenshot more than twice in a row. If you've taken 2 screenshots, proceed with an action or ask the user for clarification.
5. After completing an action, respond with a short text summary of what you did. Do NOT automatically take a verification screenshot.
6. Never take destructive actions (delete files, empty trash, send emails) without explicit user confirmation.

Example — user says "press cmd+space": call key_press with key="cmd+space", then respond "Pressed Cmd+Space (Spotlight)." Done.
Example — user says "click the Safari icon": take ONE screenshot to find it, then call click with the coordinates.`;

interface CoworkModeProps {
  session: CoworkSession | null;
  onUpdate: (session: CoworkSession) => void;
  onNewSession: () => void;
  onOpenProviders?: () => void;
  onTogglePanel?: () => void;
}

export default function CoworkMode({ session, onUpdate, onNewSession, onOpenProviders, onTogglePanel }: CoworkModeProps) {
  const store = useAppStore();
  const [isGenerating, setIsGenerating] = useState(false);
  const [accessibilityOk, setAccessibilityOk] = useState<boolean | null>(null);
  const streamingContentRef = useRef('');
  const abortRef = useRef<AbortController | null>(null);

  // Check accessibility permission on mount and whenever a session becomes active
  useEffect(() => {
    if (!session) return;
    import('@tauri-apps/api/core').then(({ invoke }) => {
      invoke<boolean>('check_accessibility').then(ok => setAccessibilityOk(ok)).catch(() => setAccessibilityOk(false));
    });
  }, [session?.id]);

  // Stop on Escape key while generating
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && isGenerating) {
        abortRef.current?.abort();
        setIsGenerating(false);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [isGenerating]);

  const executeTool = async (name: string, input: Record<string, unknown>): Promise<{ result: string; screenshot?: string }> => {
    const { invoke } = await import('@tauri-apps/api/core');

    if (name === 'take_screenshot') {
      try {
        const base64png = await invoke<string>('take_screenshot');
        return { result: 'Screenshot captured.', screenshot: base64png };
      } catch (e: any) {
        return { result: `Error capturing screenshot: ${e?.message || e}` };
      }
    }

    if (name === 'move_mouse') {
      try {
        await invoke('move_mouse', { x: Number(input.x), y: Number(input.y) });
        return { result: `Mouse moved to (${input.x}, ${input.y}).` };
      } catch (e: any) {
        return { result: `Error: ${e?.message || e}` };
      }
    }

    if (name === 'click') {
      const button = (input.button as string) || 'left';
      try {
        await invoke('click_mouse', {
          x: Number(input.x),
          y: Number(input.y),
          button: button === 'double' ? 'left' : button,
          doubleClick: button === 'double',
        });
        return { result: `${button === 'double' ? 'Double-clicked' : button.charAt(0).toUpperCase() + button.slice(1) + '-clicked'} at (${input.x}, ${input.y}).` };
      } catch (e: any) {
        return { result: `Error: ${e?.message || e}` };
      }
    }

    if (name === 'type_text') {
      try {
        await invoke('type_text', { text: input.text as string });
        return { result: `Typed: "${String(input.text).slice(0, 80)}${String(input.text).length > 80 ? '…' : ''}"` };
      } catch (e: any) {
        return { result: `Error: ${e?.message || e}` };
      }
    }

    if (name === 'key_press') {
      try {
        await invoke('key_press', { key: input.key as string });
        return { result: `Pressed key: ${input.key}` };
      } catch (e: any) {
        return { result: `Error: ${e?.message || e}` };
      }
    }

    if (name === 'scroll') {
      try {
        await invoke('scroll_mouse', {
          x: Number(input.x),
          y: Number(input.y),
          direction: input.direction as string,
          amount: Number(input.amount ?? 3),
        });
        return { result: `Scrolled ${input.direction} at (${input.x}, ${input.y}).` };
      } catch (e: any) {
        return { result: `Error: ${e?.message || e}` };
      }
    }

    return { result: `Unknown tool: ${name}` };
  };

  const runSession = useCallback(async (content: string, startingSession: CoworkSession) => {
    const { provider, model } = store.getProviderAndModel(
      startingSession.modelId || store.settings.defaultProviderModelId
    );
    if (!provider) {
      alert('No provider configured. Please add a provider in Settings.');
      return;
    }

    const userMsg: Message = {
      id: uuidv4(), role: 'user', content: content.trim(), timestamp: Date.now(),
    };

    let currentSession: CoworkSession = {
      ...startingSession,
      messages: [...startingSession.messages, userMsg],
      title: startingSession.messages.length === 0 ? content.slice(0, 50) : startingSession.title,
      updatedAt: Date.now(),
    };
    onUpdate(currentSession);
    setIsGenerating(true);

    const controller = new AbortController();
    abortRef.current = controller;

    try {
      const activeApiFormat = resolveFormat(store.settings.apiFormats || [], provider.apiFormatId);
      const isAnthropic = activeApiFormat?.id === 'anthropic';
      const baseUrl = provider.baseUrl.replace(/\/$/, '');
      const apiUrl = isAnthropic
        ? (baseUrl.includes('/messages') ? baseUrl : `${baseUrl}/messages`)
        : (baseUrl.includes('/chat/completions') ? baseUrl : `${baseUrl}/chat/completions`);
      const apiHeaders: Record<string, string> = { 'Content-Type': 'application/json' };
      if (isAnthropic) {
        apiHeaders['x-api-key'] = provider.apiKey;
        apiHeaders['anthropic-version'] = '2023-06-01';
      } else {
        apiHeaders['Authorization'] = `Bearer ${provider.apiKey}`;
      }

      const buildApiMessages = (messages: Message[]) => {
        const out: any[] = [];
        for (const m of messages) {
          if (m.role === 'user') {
            out.push({ role: 'user', content: m.content });
          } else if (m.role === 'assistant') {
            if (m.tool_calls?.length) {
              if (isAnthropic) {
                const blocks: any[] = [];
                if (m.content) blocks.push({ type: 'text', text: m.content });
                for (const tc of m.tool_calls) {
                  blocks.push({ type: 'tool_use', id: tc.id, name: tc.function.name, input: JSON.parse(tc.function.arguments) });
                }
                out.push({ role: 'assistant', content: blocks });
              } else {
                out.push({ role: 'assistant', content: m.content || null, tool_calls: m.tool_calls });
              }
            } else {
              out.push({ role: 'assistant', content: m.content });
            }
          } else if (m.role === 'tool') {
            if (isAnthropic) {
              const contentBlocks: any[] = [{ type: 'text', text: m.content }];
              // Include screenshots as image blocks in the tool result
              if (m.images?.length) {
                for (const img of m.images) {
                  contentBlocks.push({
                    type: 'image',
                    source: { type: 'base64', media_type: 'image/png', data: img },
                  });
                }
              }
              const block = { type: 'tool_result', tool_use_id: m.tool_call_id || '', content: contentBlocks };
              const last = out[out.length - 1];
              if (last?.role === 'user' && Array.isArray(last.content) && last.content[0]?.type === 'tool_result') {
                last.content.push(block);
              } else {
                out.push({ role: 'user', content: [block] });
              }
            } else {
              // OpenAI: images go inside the tool message content array (not a separate user message)
              if (m.images?.length) {
                const contentBlocks: any[] = [{ type: 'text', text: m.content }];
                for (const img of m.images) {
                  contentBlocks.push({ type: 'image_url', image_url: { url: `data:image/png;base64,${img}`, detail: 'high' } });
                }
                out.push({ role: 'tool', tool_call_id: m.tool_call_id || '', content: contentBlocks });
              } else {
                out.push({ role: 'tool', tool_call_id: m.tool_call_id || '', content: m.content });
              }
            }
          }
        }
        return out;
      };

      let continueLoop = true;
      let consecutiveScreenshots = 0;
      while (continueLoop && !controller.signal.aborted) {
        const modelId = model?.id || 'claude-opus-4-8';
        // o-series OpenAI models use max_completion_tokens; everything else uses max_tokens
        const isOSeries = !isAnthropic && /^(o\d|gpt-5)/.test(modelId);
        const body: Record<string, unknown> = {
          model: modelId,
          messages: buildApiMessages(currentSession.messages),
          [isAnthropic || !isOSeries ? 'max_tokens' : 'max_completion_tokens']: 4096,
        };
        if (isAnthropic) {
          body.system = SYSTEM_PROMPT;
          body.tools = COWORK_TOOLS;
        } else {
          body.messages = [{ role: 'system', content: SYSTEM_PROMPT }, ...buildApiMessages(currentSession.messages)];
          body.tools = COWORK_TOOLS.map(t => ({ type: 'function', function: { name: t.name, description: t.description, parameters: t.input_schema } }));
        }

        const response = await universalFetch(apiUrl, {
          method: 'POST',
          headers: apiHeaders,
          body: JSON.stringify(body),
          signal: controller.signal,
        });

        if (!response.ok) {
          const errText = await response.text();
          let clean = `Request failed (${response.status})`;
          try { const p = JSON.parse(errText); clean = p?.error?.message || p?.message || clean; } catch {}
          throw new Error(clean);
        }

        const data = await response.json();

        let textContent = '';
        const toolCallRequests: Message['tool_calls'] = [];

        if (isAnthropic) {
          for (const b of (data.content || [])) {
            if (b.type === 'text') textContent += b.text;
            if (b.type === 'tool_use') {
              toolCallRequests!.push({ id: b.id, type: 'function', function: { name: b.name, arguments: JSON.stringify(b.input) } });
            }
          }
        } else {
          const msg = data.choices?.[0]?.message;
          textContent = msg?.content || '';
          for (const tc of (msg?.tool_calls || [])) {
            toolCallRequests!.push({ id: tc.id, type: 'function', function: { name: tc.function.name, arguments: tc.function.arguments } });
          }
        }

        const stopReason = isAnthropic ? data.stop_reason : data.choices?.[0]?.finish_reason;

        if (!toolCallRequests?.length) {
          const assistantMsg: Message = { id: uuidv4(), role: 'assistant', content: textContent, timestamp: Date.now() };
          currentSession = { ...currentSession, messages: [...currentSession.messages, assistantMsg], updatedAt: Date.now() };
          onUpdate(currentSession);
          continueLoop = false;
        } else {
          const assistantMsg: Message = {
            id: uuidv4(), role: 'assistant', content: textContent,
            tool_calls: toolCallRequests, timestamp: Date.now(),
          };
          currentSession = { ...currentSession, messages: [...currentSession.messages, assistantMsg], updatedAt: Date.now() };
          onUpdate(currentSession);

          // Track consecutive screenshot calls to prevent infinite loops
          const allScreenshots = toolCallRequests!.every(tc => tc.function.name === 'take_screenshot');
          if (allScreenshots) {
            consecutiveScreenshots += toolCallRequests!.length;
          } else {
            consecutiveScreenshots = 0;
          }

          if (consecutiveScreenshots >= 3) {
            // Inject a system nudge as a tool result telling the AI to stop looping
            for (const tc of toolCallRequests!) {
              const toolMsg: Message = {
                id: uuidv4(), role: 'tool', content: 'You have taken too many screenshots in a row. Stop taking screenshots and either perform the requested action using key_press, click, or type_text, or ask the user for clarification.',
                tool_call_id: tc.id, tool_name: tc.function.name, tool_status: 'error', timestamp: Date.now(),
              };
              currentSession = { ...currentSession, messages: [...currentSession.messages, toolMsg], updatedAt: Date.now() };
              onUpdate(currentSession);
            }
            consecutiveScreenshots = 0;
          } else {
            for (const tc of toolCallRequests!) {
              const toolInput = JSON.parse(tc.function.arguments);
              const { result, screenshot } = await executeTool(tc.function.name, toolInput);

              const toolMsg: Message = {
                id: uuidv4(), role: 'tool', content: result,
                tool_call_id: tc.id, tool_name: tc.function.name,
                tool_status: result.startsWith('Error') ? 'error' : 'success',
                images: screenshot ? [screenshot] : undefined,
                timestamp: Date.now(),
              };
              currentSession = { ...currentSession, messages: [...currentSession.messages, toolMsg], updatedAt: Date.now() };
              onUpdate(currentSession);
            }
          }

          if (stopReason !== 'tool_use' && stopReason !== 'tool_calls') continueLoop = false;
        }
      }
    } catch (e: any) {
      if (e?.name !== 'AbortError') {
        const errMsg: Message = { id: uuidv4(), role: 'assistant', content: e?.message || String(e), timestamp: Date.now(), isError: true };
        onUpdate({ ...currentSession, messages: [...currentSession.messages, errMsg], updatedAt: Date.now() });
      }
    } finally {
      setIsGenerating(false);
      abortRef.current = null;
    }
  }, [isGenerating, store, onUpdate]);

  const sendMessage = useCallback((content: string, _images: string[]) => {
    if (!session || !content.trim() || isGenerating) return;
    return runSession(content, session);
  }, [session, isGenerating, runSession]);

  const handleModelChange = (modelId: string) => {
    if (!session) return;
    onUpdate({ ...session, modelId, updatedAt: Date.now() });
  };

  const handleEditMessage = (msgId: string, newContent: string) => {
    if (!session) return;
    const idx = session.messages.findIndex(m => m.id === msgId);
    if (idx === -1) return;
    const updated = session.messages.slice(0, idx + 1);
    updated[idx] = { ...updated[idx], content: newContent };
    onUpdate({ ...session, messages: updated, updatedAt: Date.now() });
  };

  const handleDeleteMessage = (msgId: string) => {
    if (!session) return;
    const idx = session.messages.findIndex(m => m.id === msgId);
    if (idx === -1) return;
    onUpdate({ ...session, messages: session.messages.slice(0, idx), updatedAt: Date.now() });
  };

  const handleRetry = () => {
    if (!session || isGenerating) return;
    const messages = session.messages;
    let lastAssistantIdx = -1;
    for (let i = messages.length - 1; i >= 0; i--) {
      if (messages[i].role === 'assistant') { lastAssistantIdx = i; break; }
    }
    if (lastAssistantIdx === -1) return;
    let userMsgIdx = -1;
    for (let i = lastAssistantIdx - 1; i >= 0; i--) {
      if (messages[i].role === 'user') { userMsgIdx = i; break; }
    }
    if (userMsgIdx === -1) return;
    const userMsg = messages[userMsgIdx];
    const trimmedSession = { ...session, messages: messages.slice(0, userMsgIdx), updatedAt: Date.now() };
    onUpdate(trimmedSession);
    runSession(userMsg.content, trimmedSession);
  };

  const handleContinue = (msgId: string) => {
    if (!session) return;
    const msg = session.messages.find(m => m.id === msgId);
    if (!msg || msg.role !== 'assistant') return;
    sendMessage(`Continue from: "${msg.content.slice(-200)}"`, []);
  };

  const fakeConversation = session ? {
    id: session.id,
    title: session.title || 'Co-work Session',
    messages: session.messages,
    createdAt: session.createdAt,
    updatedAt: session.updatedAt,
    modelId: session.modelId || store.settings.defaultProviderModelId,
  } as any : null;

  if (!session) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center gap-6 p-8 bg-[rgb(var(--bg))]">
        <div className="w-14 h-14 rounded-2xl bg-[rgb(var(--accent))] flex items-center justify-center shadow-lg">
          <Monitor size={28} className="text-[rgb(var(--accent-contrast))]" />
        </div>
        <div className="text-center space-y-2">
          <h2 className="text-xl font-semibold text-[rgb(var(--text))]">Start a Co-work Session</h2>
          <p className="text-sm text-[rgb(var(--muted))] max-w-sm">
            The AI can see your screen, move your mouse, and type on your keyboard to help you accomplish tasks.
            <br /><br />
            macOS will ask for <strong>Screen Recording</strong> and <strong>Accessibility</strong> permissions on first use.
            <br />
            Press <kbd className="bg-[rgb(var(--panel))] border border-[rgb(var(--border))] rounded px-1 py-0.5 text-[11px] font-mono">Esc</kbd> at any time to stop the AI.
          </p>
        </div>
        <button className="btn-primary gap-2" onClick={onNewSession}>
          <Plus size={15} />
          New Session
        </button>
      </div>
    );
  }

  return (
    <div className="flex-1 flex flex-col min-w-0 min-h-0 relative">
      {/* Accessibility permission banner */}
      {accessibilityOk === false && (
        <div className="flex items-center gap-2 px-4 py-2.5 bg-amber-50 dark:bg-amber-950/60 border-b border-amber-200 dark:border-amber-800 text-[13px]">
          <ShieldAlert size={15} className="text-amber-500 shrink-0" />
          <span className="flex-1 text-amber-800 dark:text-amber-300">
            <strong>Accessibility permission required</strong> for mouse & keyboard control.
          </span>
          <button
            className="text-amber-700 dark:text-amber-400 underline text-[12px] shrink-0 hover:text-amber-900 dark:hover:text-amber-200"
            onClick={async () => {
              const { invoke } = await import('@tauri-apps/api/core');
              await invoke('open_accessibility_settings').catch(() => {});
              // Re-check after a delay to see if user granted it
              setTimeout(async () => {
                const ok = await invoke<boolean>('check_accessibility').catch(() => false);
                setAccessibilityOk(ok);
              }, 3000);
            }}
          >
            Open Settings
          </button>
        </div>
      )}

      {/* Stop indicator when generating */}
      {isGenerating && (
        <div className="absolute top-3 right-3 z-10">
          <button
            onClick={() => { abortRef.current?.abort(); setIsGenerating(false); }}
            className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-xl bg-red-500/90 hover:bg-red-600 text-white text-[11px] font-medium shadow-lg backdrop-blur-sm transition-colors"
            title="Stop (Esc)"
          >
            <StopCircle size={13} />
            Stop
          </button>
        </div>
      )}

      <ChatArea
        conversation={fakeConversation}
        isGenerating={isGenerating}
        streamingContent=""
        streamingContentRef={streamingContentRef}
        allModels={store.allProviderModels}
        onSend={sendMessage}
        onModelChange={handleModelChange}
        defaultModelId={session.modelId || store.settings.defaultProviderModelId}
        onTogglePanel={onTogglePanel || (() => {})}
        onOpenProviders={onOpenProviders || (() => {})}
        onRetry={handleRetry}
        onStopGeneration={() => { abortRef.current?.abort(); setIsGenerating(false); }}
        onEditMessage={handleEditMessage}
        onDeleteMessage={handleDeleteMessage}
        onContinue={handleContinue}
        prettifyModelNames={store.settings.prettifyModelNames}
        isCode
      />
    </div>
  );
}
