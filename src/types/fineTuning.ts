export interface KnowledgeEntry {
  id: string;
  title: string;
  content: string;
  createdAt: Date;
  updatedAt: Date;
  tags?: string[];
}

export interface FineTuning {
  id: string;
  name: string;
  description: string;
  createdAt: Date;
  updatedAt: Date;
  knowledgeEntries: KnowledgeEntry[];
}

export interface FineTuningFormData {
  name: string;
  description: string;
}

export interface KnowledgeEntryFormData {
  title: string;
  content: string;
  tags?: string[];
}
