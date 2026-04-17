import { useState } from 'react';
import { Plus, Trash2, Pencil } from 'lucide-react';

interface MemoriesTabProps {
  enabled: boolean;
  memories: string[];
  onToggle: (on: boolean) => void;
  onAdd: (fact: string) => void;
  onEdit: (i: number, fact: string) => void;
  onDelete: (i: number) => void;
}

export default function MemoriesTab({ enabled, memories, onToggle, onAdd, onEdit, onDelete }: MemoriesTabProps) {
  const [newFact, setNewFact] = useState('');
  const [editingIdx, setEditingIdx] = useState<number | null>(null);
  const [editVal, setEditVal] = useState('');

  const handleAdd = () => {
    const f = newFact.trim();
    if (!f) return;
    onAdd(f);
    setNewFact('');
  };

  const startEdit = (i: number) => {
    setEditingIdx(i);
    setEditVal(memories[i]);
  };

  const commitEdit = () => {
    if (editingIdx === null) return;
    const f = editVal.trim();
    if (f) onEdit(editingIdx, f);
    setEditingIdx(null);
  };

  return (
    <div className="flex-1 overflow-y-auto p-5 pb-safe max-w-2xl space-y-5">
      {/* Enable toggle */}
      <div className="flex items-center justify-between bg-[rgb(var(--panel))] border border-[rgb(var(--border))] rounded-2xl px-4 py-3">
        <div>
          <p className="text-sm font-semibold">Persistent Memories</p>
          <p className="text-xs text-[rgb(var(--muted))] mt-0.5">
            When enabled, the AI can save and recall facts about you across conversations.
          </p>
        </div>
        <button
          onClick={() => onToggle(!enabled)}
          className={`toggle w-11 h-6 shrink-0 ${enabled ? 'bg-[rgb(var(--accent))]' : 'bg-black/20 dark:bg-white/20'}`}
        >
          <span className={`toggle-thumb w-4 h-4 ${enabled ? 'translate-x-5' : 'translate-x-1'}`} />
        </button>
      </div>

      {enabled && (
        <>
          <p className="text-xs text-[rgb(var(--muted))]">
            The AI will automatically save important facts (timezone, preferences, name, etc.) and include them in every conversation. You can also add or edit memories manually.
          </p>

          {/* Memory list */}
          <div className="space-y-2">
            {memories.length === 0 && (
              <p className="text-xs text-[rgb(var(--muted))] text-center py-6 border border-dashed border-[rgb(var(--border))] rounded-xl">
                No memories yet. Start chatting and the AI will save important facts automatically.
              </p>
            )}
            {memories.map((m, i) => (
              <div key={i} className="bg-[rgb(var(--panel))] border border-[rgb(var(--border))] rounded-xl px-3 py-2.5 flex items-start gap-2">
                {editingIdx === i ? (
                  <>
                    <input
                      className="input text-sm flex-1 py-1"
                      value={editVal}
                      onChange={e => setEditVal(e.target.value)}
                      onKeyDown={e => { if (e.key === 'Enter') commitEdit(); if (e.key === 'Escape') setEditingIdx(null); }}
                      autoFocus
                    />
                    <button onClick={commitEdit} className="btn-primary py-1 px-3 text-xs shrink-0">Save</button>
                    <button onClick={() => setEditingIdx(null)} className="btn-secondary py-1 px-3 text-xs shrink-0">Cancel</button>
                  </>
                ) : (
                  <>
                    <span className="text-sm flex-1 leading-relaxed">{m}</span>
                    <button onClick={() => startEdit(i)} className="btn-icon w-6 h-6 text-[rgb(var(--muted))] shrink-0">
                      <Pencil size={12} />
                    </button>
                    <button onClick={() => onDelete(i)} className="btn-icon w-6 h-6 text-[rgb(var(--muted))] hover:text-red-500 shrink-0">
                      <Trash2 size={12} />
                    </button>
                  </>
                )}
              </div>
            ))}
          </div>

          {/* Add new */}
          <div className="flex gap-2">
            <input
              className="input text-sm flex-1"
              value={newFact}
              onChange={e => setNewFact(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && handleAdd()}
              placeholder="Add a memory, e.g. User prefers dark mode"
            />
            <button onClick={handleAdd} disabled={!newFact.trim()} className="btn-primary px-4 text-sm gap-1.5 shrink-0">
              <Plus size={14} />Add
            </button>
          </div>
        </>
      )}
    </div>
  );
}
