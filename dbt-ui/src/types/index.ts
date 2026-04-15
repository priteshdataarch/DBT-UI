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
  language: 'sql' | 'yaml' | 'markdown';
}

export interface ChatMessage {
  role: 'user' | 'assistant';
  content: string;
  sources?: string[];
  timestamp: Date;
}
