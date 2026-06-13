import { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import { ArrowLeft, Trash2, Settings, X } from 'lucide-react';
import { imageDB, type GeneratedImage } from '../utils/imageDB';
import type { AppSettings, ModelProvider } from '../types';
import ChatInput from './ChatInput';
import { getModelInfo } from '../utils/models';
import { tauriUtils } from '../utils/tauri';

interface Model {
  fullId: string;
  name: string;
  providerName: string;
  providerId: string;
  supportsImages?: boolean;
  contextLength?: number;
}

interface Props {
  settings: AppSettings;
  allModels: Model[];
  onTogglePanel: () => void;
  onOpenProviders: () => void;
  selectedImageId?: string | null;
}

// ── Aspect ratio ────────────────────────────────────────────────────────────
interface AR { w: number; h: number }

const PRESETS: (AR & { label: string })[] = [
  { label: '1:1',  w: 1,  h: 1  },
  { label: '4:3',  w: 4,  h: 3  },
  { label: '3:4',  w: 3,  h: 4  },
  { label: '16:9', w: 16, h: 9  },
  { label: '9:16', w: 9,  h: 16 },
  { label: '3:2',  w: 3,  h: 2  },
  { label: '2:3',  w: 2,  h: 3  },
];

function gcd(a: number, b: number): number { return b === 0 ? a : gcd(b, a % b); }

function simplify(w: number, h: number): AR {
  const g = gcd(Math.round(w), Math.round(h));
  return { w: Math.round(w) / g, h: Math.round(h) / g };
}

function ratioToSize(w: number, h: number): string {
  // Normalize longest side to 1024, round to multiple of 8
  const scale = 1024 / Math.max(w, h);
  return `${Math.round(w * scale / 8) * 8}x${Math.round(h * scale / 8) * 8}`;
}

function snapToPreset(w: number, h: number): AR {
  const r = w / h;
  // Snap to nearest preset within 12% — wider threshold makes drag feel snappy
  let best: (AR & { label: string }) | null = null;
  let bestDist = Infinity;
  for (const p of PRESETS) {
    const dist = Math.abs(r - p.w / p.h) / (p.w / p.h);
    if (dist < bestDist) { bestDist = dist; best = p; }
  }
  if (best && bestDist < 0.12) return { w: best.w, h: best.h };
  return simplify(w, h);
}

const DRAG_SIZE = 120; // px container
const DRAG_MIN  = 28;  // px minimum box side

function AspectRatioPicker({ value, onChange }: { value: AR; onChange: (r: AR) => void }) {
  const containerRef = useRef<HTMLDivElement>(null);
  const dragging = useRef(false);

  // Box pixel dimensions inside the DRAG_SIZE container
  const r = value.w / value.h;
  const boxW = r >= 1 ? DRAG_SIZE : Math.max(DRAG_MIN, DRAG_SIZE * r);
  const boxH = r <= 1 ? DRAG_SIZE : Math.max(DRAG_MIN, DRAG_SIZE / r);

  const onMouseDown = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    dragging.current = true;
  }, []);

  useEffect(() => {
    const onMove = (e: MouseEvent) => {
      if (!dragging.current || !containerRef.current) return;
      const rect = containerRef.current.getBoundingClientRect();
      const x = Math.max(DRAG_MIN, Math.min(DRAG_SIZE, e.clientX - rect.left));
      const y = Math.max(DRAG_MIN, Math.min(DRAG_SIZE, e.clientY - rect.top));
      onChange(snapToPreset(x, y));
    };
    const onUp = () => { dragging.current = false; };
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
    return () => { window.removeEventListener('mousemove', onMove); window.removeEventListener('mouseup', onUp); };
  }, [onChange]);

  const isPreset = (p: AR) => p.w === value.w && p.h === value.h;

  return (
    <div className="flex items-start gap-4 px-1">
      {/* Drag box */}
      <div className="flex flex-col items-center gap-1.5">
        <div
          ref={containerRef}
          style={{ width: DRAG_SIZE, height: DRAG_SIZE }}
          className="relative rounded-xl bg-black/[0.04] dark:bg-white/[0.05] shrink-0"
        >
          {/* Guide lines */}
          <div className="absolute inset-0 flex items-center justify-center pointer-events-none opacity-20">
            <div className="w-full h-px bg-[rgb(var(--muted))]" />
          </div>
          <div className="absolute inset-0 flex items-center justify-center pointer-events-none opacity-20">
            <div className="w-px h-full bg-[rgb(var(--muted))]" />
          </div>
          {/* Ratio box */}
          <div
            style={{ width: boxW, height: boxH }}
            className="absolute top-0 left-0 bg-[rgb(var(--accent))]/15 border border-[rgb(var(--accent))]/40 rounded-md"
          >
            {/* Corner drag handle */}
            <div
              onMouseDown={onMouseDown}
              style={{ cursor: 'nwse-resize' }}
              className="absolute bottom-0 right-0 w-3.5 h-3.5 bg-[rgb(var(--accent))] rounded-tl-md rounded-br-md flex items-center justify-center"
            >
              <svg width="6" height="6" viewBox="0 0 6 6" fill="white">
                <path d="M1 5L5 1M3 5L5 3" stroke="white" strokeWidth="1.2" strokeLinecap="round"/>
              </svg>
            </div>
          </div>
        </div>
        <span className="text-[11px] font-mono text-[rgb(var(--muted))]">{value.w}:{value.h}</span>
        <span className="text-[10px] text-[rgb(var(--muted))]/60 font-mono">{ratioToSize(value.w, value.h)}</span>
      </div>

      {/* Preset grid */}
      <div className="flex flex-wrap gap-1.5 pt-1">
        {PRESETS.map(p => {
          const selected = isPreset(p);
          // Visual box: scale so longest side = 32px
          const pr = p.w / p.h;
          const vw = pr >= 1 ? 32 : Math.round(32 * pr);
          const vh = pr <= 1 ? 32 : Math.round(32 / pr);
          return (
            <button
              key={p.label}
              onClick={() => onChange(p)}
              className={`flex flex-col items-center gap-1 px-2 py-1.5 rounded-lg transition-all ${
                selected
                  ? 'bg-[rgb(var(--accent))] text-[rgb(var(--accent-contrast))]'
                  : 'bg-black/[0.04] dark:bg-white/[0.05] hover:bg-black/[0.08] dark:hover:bg-white/[0.09] text-[rgb(var(--muted))]'
              }`}
              title={p.label}
            >
              <div
                style={{ width: vw, height: vh }}
                className={`rounded-sm border ${selected ? 'border-[rgb(var(--accent-contrast))]/60 bg-[rgb(var(--accent-contrast))]/20' : 'border-[rgb(var(--muted))]/40'}`}
              />
              <span className="text-[10px] font-medium leading-none">{p.label}</span>
            </button>
          );
        })}
      </div>
    </div>
  );
}

// Build base URL for /v1/... endpoints (strips chat/messages suffix, avoids double /v1)
function buildBaseV1(rawBaseUrl: string): string {
  let url = rawBaseUrl.replace(/\/$/, '');
  url = url.replace(/\/(chat\/completions|messages)$/, '');
  return url.endsWith('/v1') ? url : `${url}/v1`;
}

export default function ImageMode({ settings, allModels, onTogglePanel, onOpenProviders, selectedImageId }: Props) {
  const [images, setImages] = useState<GeneratedImage[]>([]);
  const [generating, setGenerating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selected, setSelected] = useState<GeneratedImage | null>(null);
  const [aspectRatio, setAspectRatio] = useState<AR>({ w: 1, h: 1 });
  const originalPromptRef = useRef<string | null>(null);

  // Image generation model — shown in ChatInput model picker
  const [imageGenFullId, setImageGenFullId] = useState<string>(
    () => settings.defaultProviderModelId || allModels[0]?.fullId || ''
  );

  const imageGenProvider = useMemo((): ModelProvider | undefined => {
    const providerId = imageGenFullId.split('/')[0];
    return settings.providers.find(p => p.id === providerId && p.enabled && p.apiKey)
      ?? settings.providers.find(p => p.enabled && p.apiKey);
  }, [imageGenFullId, settings]);

  const imageGenModelId = imageGenFullId.includes('/')
    ? imageGenFullId.split('/').slice(1).join('/')
    : imageGenFullId;

  // Optimizer model — configured in Settings → General, not in the picker
  const optimizerModelId = useMemo(() => {
    const baseUrl = settings.imagePromptOptimizeBaseUrl;
    const modelId = settings.imagePromptOptimizeModel || 'gpt-4o-mini';
    const provider = baseUrl
      ? settings.providers.find(p => p.enabled && p.baseUrl?.replace(/\/$/, '') === baseUrl.replace(/\/$/, ''))
      : settings.providers.find(p => p.enabled && p.apiKey);
    return provider ? `${provider.id}/${modelId}` : modelId;
  }, [settings]);

  useEffect(() => {
    imageDB.getAll().then(setImages);
  }, []);

  useEffect(() => {
    if (!selectedImageId) return;
    imageDB.getAll().then(all => {
      const found = all.find(i => i.id === selectedImageId);
      if (found) { setImages(all); setSelected(found); }
    });
  }, [selectedImageId]);

  // --- Image generation (always uses imageGenProvider + imageGenModelId) ---
  const generateImage = async (prompt: string): Promise<GeneratedImage | null> => {
    if (!imageGenProvider?.apiKey) {
      setError('No provider with an API key found. Check Settings → Providers.');
      return null;
    }
    const base = buildBaseV1(imageGenProvider.baseUrl || 'https://api.openai.com/v1');
    const res = await fetch(`${base}/images/generations`, {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${imageGenProvider.apiKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ model: imageGenModelId, prompt, n: 1, size: ratioToSize(aspectRatio.w, aspectRatio.h) }),
    });
    if (!res.ok) throw new Error(`API error ${res.status}: ${await res.text()}`);
    const data = await res.json();
    const b64 = data.data?.[0]?.b64_json;
    if (!b64) throw new Error('No image data in response');
    const userPrompt = originalPromptRef.current ?? undefined;
    originalPromptRef.current = null;
    return {
      id: crypto.randomUUID(),
      prompt,
      userPrompt: userPrompt !== prompt ? userPrompt : undefined,
      revisedPrompt: data.data?.[0]?.revised_prompt,
      b64: `data:image/png;base64,${b64}`,
      createdAt: Date.now(),
      model: imageGenModelId,
    };
  };

  const handleGenerate = async (prompt: string) => {
    if (!prompt.trim() || generating) return;
    setGenerating(true);
    setError(null);
    try {
      const img = await generateImage(prompt.trim());
      if (img) { await imageDB.save(img); setImages(prev => [img, ...prev]); }
    } catch (e: any) {
      setError(e.message || 'Generation failed');
    } finally {
      setGenerating(false);
    }
  };

  // --- Image edit (multipart, same provider) ---
  const handleEdit = async (prompt: string) => {
    if (!prompt.trim() || generating || !selected) return;
    setGenerating(true);
    setError(null);
    try {
      if (!imageGenProvider?.apiKey) throw new Error('No provider with an API key found.');
      const base = buildBaseV1(imageGenProvider.baseUrl || 'https://api.openai.com/v1');
      const b64Data = selected.b64.replace(/^data:image\/\w+;base64,/, '');
      const imageBlob = new Blob([Uint8Array.from(atob(b64Data), c => c.charCodeAt(0))], { type: 'image/png' });
      const form = new FormData();
      form.append('model', imageGenModelId);
      form.append('prompt', prompt.trim());
      form.append('image', imageBlob, 'image.png');
      const res = await fetch(`${base}/images/edits`, {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${imageGenProvider.apiKey}` },
        body: form,
      });
      if (!res.ok) throw new Error(`API error ${res.status}: ${await res.text()}`);
      const data = await res.json();
      const b64 = data.data?.[0]?.b64_json;
      if (!b64) throw new Error('No image data in response');
      const userPrompt = originalPromptRef.current ?? undefined;
      originalPromptRef.current = null;
      const img: GeneratedImage = {
        id: crypto.randomUUID(),
        prompt: prompt.trim(),
        userPrompt: userPrompt !== prompt.trim() ? userPrompt : undefined,
        b64: `data:image/png;base64,${b64}`,
        createdAt: Date.now(),
        model: imageGenModelId,
        rootId: selected.rootId || selected.id,
      };
      await imageDB.save(img);
      setImages(prev => [img, ...prev]);
      setSelected(img);
    } catch (e: any) {
      setError(e.message || 'Edit failed');
    } finally {
      setGenerating(false);
    }
  };

  const handleDelete = async (id: string, e?: React.MouseEvent) => {
    e?.stopPropagation();
    await imageDB.delete(id);
    setImages(prev => prev.filter(i => i.id !== id));
    if (selected?.id === id) setSelected(null);
  };

  // --- Prompt optimizer (uses optimizerModelId via chat completions) ---
  const handleOptimizePrompt = async (prompt: string): Promise<string> => {
    const providerId = optimizerModelId.split('/')[0];
    const modelId = optimizerModelId.includes('/') ? optimizerModelId.split('/').slice(1).join('/') : optimizerModelId;
    const provider = settings.providers.find(p => p.id === providerId && p.enabled)
      ?? settings.providers.find(p => p.enabled && p.apiKey);
    if (!provider?.apiKey) throw new Error('No API key for optimizer model');
    const base = buildBaseV1(provider.baseUrl || 'https://api.openai.com/v1');
    const res = await fetch(`${base}/chat/completions`, {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${provider.apiKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: modelId,
        messages: [
          { role: 'system', content: 'You are an expert image prompt engineer. Rewrite the user\'s prompt to be more detailed, vivid, and effective for AI image generation. Return only the improved prompt, nothing else.' },
          { role: 'user', content: prompt },
        ],
        max_tokens: 300,
      }),
    });
    if (!res.ok) throw new Error(`Optimizer error ${res.status}: ${await res.text()}`);
    const data = await res.json();
    return data.choices?.[0]?.message?.content?.trim() || prompt;
  };

  const imageGenInfo = getModelInfo(imageGenModelId);
  const imageGenModelName = imageGenInfo.displayName || imageGenModelId.split('/').pop() || imageGenModelId;

  const sharedInputProps = {
    isGenerating: generating,
    modelName: imageGenModelName,
    allModels,
    selectedModelId: imageGenFullId,
    onModelChange: setImageGenFullId,
    onOpenProviders,
    imageGenerateMode: true as const,
    prettifyModelNames: true,
    onOptimizePrompt: handleOptimizePrompt,
    onBeforeSend: (original: string) => { originalPromptRef.current = original; },
  };

  // ── Detail view ──
  if (selected) {
    const rootId = selected.rootId || selected.id;
    const revisions = images
      .filter(i => (i.rootId || i.id) === rootId)
      .sort((a, b) => a.createdAt - b.createdAt);
    const hasRevisions = revisions.length > 1;

    const downloadImage = async (img: GeneratedImage) => {
      const filename = `image-${img.id.slice(0, 8)}.png`;
      if (tauriUtils.isTauri) {
        try {
          const { save } = await import('@tauri-apps/plugin-dialog');
          const { writeFile } = await import('@tauri-apps/plugin-fs');
          const savePath = await save({ defaultPath: filename, filters: [{ name: 'PNG Image', extensions: ['png'] }] });
          if (!savePath) return;
          const b64Data = img.b64.replace(/^data:image\/\w+;base64,/, '');
          const bytes = Uint8Array.from(atob(b64Data), c => c.charCodeAt(0));
          await writeFile(savePath, bytes);
        } catch (e: any) {
          setError(`Save failed: ${e.message}`);
        }
      } else {
        const a = document.createElement('a');
        a.href = img.b64;
        a.download = filename;
        a.click();
      }
    };

    return (
      <div className="flex-1 flex flex-col bg-[rgb(var(--bg))] overflow-hidden">
        {/* Header */}
        <div className="flex items-center gap-3 px-5 py-3 border-b border-[rgb(var(--border))] shrink-0">
          <button onClick={() => setSelected(null)} className="btn-icon"><ArrowLeft size={16} /></button>
          <div className="flex-1 min-w-0">
            {selected.userPrompt ? (
              <>
                <p className="text-[13px] font-medium truncate text-[rgb(var(--text))]" title={selected.prompt}>
                  {selected.prompt}
                </p>
                <p className="text-[11px] text-[rgb(var(--muted))] truncate" title={selected.userPrompt}>
                  Original: {selected.userPrompt}
                </p>
              </>
            ) : (
              <p className="text-[13px] font-medium truncate" title={selected.revisedPrompt || selected.prompt}>
                {selected.revisedPrompt || selected.prompt}
              </p>
            )}
          </div>
          <button onClick={() => downloadImage(selected)} className="btn-icon text-[rgb(var(--muted))]" title="Download">
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>
          </button>
          <button onClick={() => handleDelete(selected.id)} className="btn-icon text-[rgb(var(--muted))] hover:text-red-500"><Trash2 size={15} /></button>
          <button onClick={onTogglePanel} className="btn-icon"><Settings size={15} /></button>
        </div>

        {/* Main image */}
        <div className="flex-1 flex items-center justify-center p-6 overflow-auto min-h-0">
          <img
            src={selected.b64}
            alt={selected.prompt}
            className="max-w-full max-h-full rounded-2xl shadow-2xl object-contain"
          />
        </div>

        {/* Revision strip */}
        {hasRevisions && (
          <div className="shrink-0 px-4 pb-3 pt-1 border-t border-[rgb(var(--border))]">
            <p className="text-[11px] text-[rgb(var(--muted))] mb-2">
              Revisions · {revisions.findIndex(r => r.id === selected.id) + 1} / {revisions.length}
            </p>
            <div className="flex gap-2 overflow-x-auto pb-1">
              {revisions.map((rev, idx) => (
                <button
                  key={rev.id}
                  onClick={() => setSelected(rev)}
                  className="relative shrink-0 group"
                  title={rev.prompt}
                >
                  <img
                    src={rev.b64}
                    alt={rev.prompt}
                    className={`w-14 h-14 rounded-lg object-cover transition-all ${
                      rev.id === selected.id
                        ? 'ring-2 ring-[rgb(var(--accent))] opacity-100'
                        : 'opacity-50 hover:opacity-80'
                    }`}
                  />
                  <span className="absolute bottom-0.5 left-0.5 text-[9px] font-bold text-white bg-black/60 rounded px-0.5 leading-tight">
                    v{idx + 1}
                  </span>
                  <button
                    onClick={e => { e.stopPropagation(); downloadImage(rev); }}
                    className="absolute top-0.5 right-0.5 w-4 h-4 rounded bg-black/60 text-white flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity"
                  >
                    <svg width="9" height="9" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>
                  </button>
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Edit input */}
        {error && (
          <div className="mx-5 mb-2 text-red-500 text-[12px] bg-red-50 dark:bg-red-900/20 px-3 py-2 rounded-xl flex items-start gap-2">
            <span className="flex-1">{error}</span>
            <button onClick={() => setError(null)}><X size={12} /></button>
          </div>
        )}
        <ChatInput {...sharedInputProps} onSend={handleEdit} placeholder="Describe an edit..." />
      </div>
    );
  }

  // ── Gallery view ──
  return (
    <div className="flex-1 overflow-y-auto bg-[rgb(var(--bg))]">
      <div className="flex flex-col items-center">

        {/* Centered input — full viewport height so gallery starts off-screen */}
        <div className="flex flex-col items-center justify-center w-full max-w-2xl px-2" style={{ minHeight: '100svh' }}>
          <h1 className="text-[22px] font-semibold text-center mb-6 text-[rgb(var(--text))]">
            Generate an image
          </h1>

          {/* Aspect ratio picker */}
          <div className="w-full mb-5">
            <p className="text-[11px] font-medium text-[rgb(var(--muted))] uppercase tracking-wider mb-3 px-1">Aspect ratio</p>
            <AspectRatioPicker value={aspectRatio} onChange={setAspectRatio} />
          </div>

          {error && (
            <div className="mb-2 w-full text-red-500 text-[12px] bg-red-50 dark:bg-red-900/20 px-3 py-2 rounded-xl flex items-start gap-2">
              <span className="flex-1">{error}</span>
              <button onClick={() => setError(null)}><X size={12} /></button>
            </div>
          )}
          <div className="w-full">
            <ChatInput {...sharedInputProps} onSend={handleGenerate} />
          </div>
          {(images.length > 0 || generating) && (
            <p className="text-[11px] text-[rgb(var(--muted))] mt-2 animate-bounce">↓ scroll to see images</p>
          )}
        </div>

        {/* Gallery — below the fold */}
        {(images.length > 0 || generating) && (
          <div className="w-full px-6 pb-10 max-w-2xl mx-auto">
            <p className="text-[12px] text-[rgb(var(--muted))] mb-4 text-center">Previously generated</p>
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
              {generating && (
                <div className="aspect-square rounded-xl overflow-hidden relative">
                  <div
                    className="absolute inset-0"
                    style={{
                      background: 'linear-gradient(135deg, #6366f1 0%, #8b5cf6 25%, #ec4899 50%, #f59e0b 75%, #10b981 100%)',
                      backgroundSize: '400% 400%',
                      animation: 'gradientShift 3s ease infinite',
                    }}
                  />
                  <div className="absolute inset-0 backdrop-blur-sm bg-black/20" />
                  <div className="absolute inset-0 flex items-center justify-center gap-1.5">
                    {[0, 1, 2].map(i => (
                      <div
                        key={i}
                        className="w-2 h-2 rounded-full bg-white"
                        style={{ animation: `dotBounce 1.2s ease-in-out ${i * 0.2}s infinite` }}
                      />
                    ))}
                  </div>
                </div>
              )}
              {images.map(img => (
                <div
                  key={img.id}
                  onClick={() => setSelected(img)}
                  className="group relative rounded-xl overflow-hidden cursor-pointer aspect-square bg-black/5 dark:bg-white/5 hover:ring-2 hover:ring-[rgb(var(--accent))] transition-all"
                >
                  <img src={img.b64} alt={img.prompt} className="w-full h-full object-cover" />
                  <div className="absolute inset-0 bg-black/0 group-hover:bg-black/30 transition-all flex items-end">
                    <div className="opacity-0 group-hover:opacity-100 transition-all w-full p-2">
                      <p className="text-white text-[11px] line-clamp-2">{img.prompt}</p>
                    </div>
                  </div>
                  <button
                    onClick={e => handleDelete(img.id, e)}
                    className="absolute top-1.5 right-1.5 opacity-0 group-hover:opacity-100 w-6 h-6 rounded-full bg-black/60 text-white flex items-center justify-center hover:bg-red-500 transition-all"
                  >
                    <Trash2 size={11} />
                  </button>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
