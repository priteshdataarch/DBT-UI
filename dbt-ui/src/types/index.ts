export interface FileNode {
  name: string;
  type: 'file' | 'directory';
  path: string;
  children?: FileNode[];
  extension?: string;
}

export interface OpenFileTab {
  path: string;
  name: string;
  content: string;
  isDirty: boolean;
  language: 'sql' | 'yaml' | 'markdown' | 'csv';
  /** Server mtime (ms) at last load or successful save — for conflict detection. */
  baseMtimeMs: number | null;
  /** Set when DBT_UI_REQUIRE_LOGIN and we hold the edit lock. */
  lockToken: string | null;
  /** If set, another user holds the lock — editor is read-only. */
  lockBlockedBy: string | null;
  /** True when login is off — no DB locks, mtime check only if baseMtimeMs set. */
  fileLockBypass: boolean;
}

export interface ChatMessage {
  role: 'user' | 'assistant';
  content: string;
  sources?: string[];
  schemaChunks?: string[];
  mode?: 'sql' | 'authoring' | 'filesystem' | 'error';
  timestamp: Date;
}
