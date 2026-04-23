import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { FineTuning, KnowledgeEntry, FineTuningFormData, KnowledgeEntryFormData } from '../types/fineTuning';

interface FineTuningState {
  fineTunings: FineTuning[];
  selectedFineTuningId: string | null;
  
  // Fine-tuning actions
  createFineTuning: (data: FineTuningFormData) => FineTuning;
  updateFineTuning: (id: string, data: Partial<FineTuningFormData>) => void;
  deleteFineTuning: (id: string) => void;
  getFineTuning: (id: string) => FineTuning | undefined;
  selectFineTuning: (id: string | null) => void;
  
  // Knowledge entry actions
  addKnowledgeEntry: (fineTuningId: string, data: KnowledgeEntryFormData) => KnowledgeEntry;
  updateKnowledgeEntry: (fineTuningId: string, entryId: string, data: Partial<KnowledgeEntryFormData>) => void;
  deleteKnowledgeEntry: (fineTuningId: string, entryId: string) => void;
  getKnowledgeEntry: (fineTuningId: string, entryId: string) => KnowledgeEntry | undefined;
}

export const useFineTuningStore = create<FineTuningState>()(
  persist(
    (set, get) => ({
      fineTunings: [],
      selectedFineTuningId: null,

      createFineTuning: (data: FineTuningFormData) => {
        const newFineTuning: FineTuning = {
          id: crypto.randomUUID(),
          name: data.name,
          description: data.description,
          createdAt: new Date(),
          updatedAt: new Date(),
          knowledgeEntries: [],
        };

        set((state) => ({
          fineTunings: [...state.fineTunings, newFineTuning],
        }));

        return newFineTuning;
      },

      updateFineTuning: (id: string, data: Partial<FineTuningFormData>) => {
        set((state) => ({
          fineTunings: state.fineTunings.map((ft) =>
            ft.id === id
              ? { ...ft, ...data, updatedAt: new Date() }
              : ft
          ),
        }));
      },

      deleteFineTuning: (id: string) => {
        set((state) => ({
          fineTunings: state.fineTunings.filter((ft) => ft.id !== id),
          selectedFineTuningId: state.selectedFineTuningId === id ? null : state.selectedFineTuningId,
        }));
      },

      getFineTuning: (id: string) => {
        return get().fineTunings.find((ft) => ft.id === id);
      },

      selectFineTuning: (id: string | null) => {
        console.log('=== SELECT FINE TUNING ===');
        console.log('Setting selectedFineTuningId to:', id);
        console.log('=== END SELECT FINE TUNING ===');
        set({ selectedFineTuningId: id });
      },

      addKnowledgeEntry: (fineTuningId: string, data: KnowledgeEntryFormData) => {
        const newEntry: KnowledgeEntry = {
          id: crypto.randomUUID(),
          title: data.title,
          content: data.content,
          tags: data.tags || [],
          createdAt: new Date(),
          updatedAt: new Date(),
        };

        set((state) => ({
          fineTunings: state.fineTunings.map((ft) =>
            ft.id === fineTuningId
              ? {
                  ...ft,
                  knowledgeEntries: [...ft.knowledgeEntries, newEntry],
                  updatedAt: new Date(),
                }
              : ft
          ),
        }));

        return newEntry;
      },

      updateKnowledgeEntry: (fineTuningId: string, entryId: string, data: Partial<KnowledgeEntryFormData>) => {
        set((state) => ({
          fineTunings: state.fineTunings.map((ft) =>
            ft.id === fineTuningId
              ? {
                  ...ft,
                  knowledgeEntries: ft.knowledgeEntries.map((entry) =>
                    entry.id === entryId
                      ? { ...entry, ...data, updatedAt: new Date() }
                      : entry
                  ),
                  updatedAt: new Date(),
                }
              : ft
          ),
        }));
      },

      deleteKnowledgeEntry: (fineTuningId: string, entryId: string) => {
        set((state) => ({
          fineTunings: state.fineTunings.map((ft) =>
            ft.id === fineTuningId
              ? {
                  ...ft,
                  knowledgeEntries: ft.knowledgeEntries.filter((entry) => entry.id !== entryId),
                  updatedAt: new Date(),
                }
              : ft
          ),
        }));
      },

      getKnowledgeEntry: (fineTuningId: string, entryId: string) => {
        const fineTuning = get().fineTunings.find((ft) => ft.id === fineTuningId);
        return fineTuning?.knowledgeEntries.find((entry) => entry.id === entryId);
      },
    }),
    {
      name: 'fine-tuning-storage',
      onRehydrateStorage: () => (state) => {
        if (state) {
          // Convert string dates back to Date objects
          state.fineTunings = state.fineTunings.map(ft => ({
            ...ft,
            createdAt: new Date(ft.createdAt),
            updatedAt: new Date(ft.updatedAt),
            knowledgeEntries: ft.knowledgeEntries.map(entry => ({
              ...entry,
              createdAt: new Date(entry.createdAt),
              updatedAt: new Date(entry.updatedAt),
            })),
          }));
        }
      },
    }
  )
);
