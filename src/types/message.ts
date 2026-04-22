/**
 * JSONL 消息类型定义
 */

// ============================================================================
// 原始数据类型（解析器输入）
// ============================================================================

/** 内容项类型（原始 JSONL 中的 content 数组元素） */
export type ContentItem =
  | { type: 'text'; text: string }
  | { type: 'thinking'; thinking: string }
  | { type: 'tool_use'; id: string; name: string; arguments?: string | object; input?: object }
  | { type: 'toolCall'; id: string; name: string; arguments?: string | object; input?: object }
  | { type: 'tool_result'; tool_use_id: string; content: string | ContentItem[] }
  | { type: 'image_url'; image_url: { url: string } };

/** OpenClaw 格式的 JSONL 记录 */
export interface OpenClawRecord {
  type: string;
  id?: string;
  uuid?: string;
  timestamp?: string;
  subtype?: string;
  message?: {
    role?: string;
    content?: string | ContentItem[];
    tool_calls?: Array<{
      id?: string;
      function?: { name: string; arguments: string };
      name?: string;
      arguments?: string | object;
      input?: object;
    }>;
    toolCallId?: string;
    name?: string;
  };
}

/** Claude Code 格式的 JSONL 记录 */
export interface ClaudeCodeRecord {
  type: string;
  uuid: string;
  parentUuid?: string;
  timestamp?: string;
  subtype?: string;
  content?: string;
  level?: string;
  isMeta?: boolean;
  message?: {
    id?: string;
    role?: string;
    type?: string;
    content?: ContentItem[];
    model?: string;
    stop_reason?: string;
  };
  promptId?: string;
  userType?: string;
  toolUseResult?: {
    filenames?: string[];
    durationMs?: number;
    numFiles?: number;
    truncated?: boolean;
  };
  sourceToolAssistantUUID?: string;
}

// ============================================================================
// 解析结果类型（渲染使用）
// ============================================================================

/** 内容块类型（渲染用，有序排列） */
export type ContentBlock =
  | { type: 'text'; text: string }
  | { type: 'thinking'; content: string }
  | { type: 'toolCalls'; calls: Array<{ name: string; arguments: string }> }
  | { type: 'toolResult'; toolName: string; toolArgs: string; content: string }
  | { type: 'skillListing'; skills: string; skillCount: number }
  | { type: 'taskReminder'; tasks: TaskItem[] }
  | { type: 'fileAttachment'; filename: string; content: string };

/** 任务项 */
export interface TaskItem {
  id: string;
  subject: string;
  description?: string;
  status: 'pending' | 'in_progress' | 'completed';
}

/** 解析后的消息（渲染用） */
export interface ParsedMessage {
  id: string;
  role: 'user' | 'assistant' | 'system' | 'tool' | 'toolResult' | 'stats' | 'unknown';
  name: string;
  avatar: string;
  timestamp: string;
  /** 原始 JSON 行数组（用于查看原文） */
  rawLines: string[];
  /** 对应的原始文件行号（1-based） */
  lineNumbers: number[];
  /** 有序的内容块 */
  contentBlocks: ContentBlock[];
}

// ============================================================================
// UI 相关类型
// ============================================================================

/** 文件信息 */
export interface FileInfo {
  name: string;
  path: string;
  mtime: number;
}

/** 发现的目录项 */
export interface DiscoveredItem {
  name: string;
  path: string;
  count: number;
}

/** 来源类型 */
export type SourceType = 'openclaw' | 'claude-code' | 'custom';
