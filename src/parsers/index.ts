import { OpenClawParser } from './OpenClawParser';
import { ClaudeCodeParser } from './ClaudeCodeParser';
import type { SourceType } from '../types/message';
import type { JsonlParser } from './types';

/**
 * 检测 JSONL 文件格式
 * 返回 'openclaw' | 'claude-code'
 */
export function detectFormat(lines: string[]): 'openclaw' | 'claude-code' {
  // 检查前几行（跳过空行）
  for (const line of lines.slice(0, 10)) {
    if (!line.trim()) continue;
    try {
      const data = JSON.parse(line);

      // Claude Code 特征：type 直接是 assistant/user，有 sessionId
      if (
        (data.type === 'assistant' || data.type === 'user') &&
        (data.sessionId || data.parentUuid || data.promptId)
      ) {
        return 'claude-code';
      }

      // OpenClaw 特征：type 是 message，有 message.role
      if (data.type === 'message' && data.message?.role) {
        return 'openclaw';
      }
    } catch {
      // ignore parse errors
    }
  }

  // 默认返回 openclaw
  return 'openclaw';
}

/**
 * 根据来源类型获取对应的解析器
 */
export function getParser(sourceType: SourceType, lines?: string[]): JsonlParser {
  switch (sourceType) {
    case 'openclaw':
      return new OpenClawParser();
    case 'claude-code':
      return new ClaudeCodeParser();
    case 'custom':
      // 自定义模式自动检测格式
      if (lines) {
        const format = detectFormat(lines);
        return format === 'claude-code' ? new ClaudeCodeParser() : new OpenClawParser();
      }
      return new OpenClawParser();
    default:
      return new OpenClawParser();
  }
}

export type { JsonlParser } from './types';
export { OpenClawParser } from './OpenClawParser';
export { ClaudeCodeParser } from './ClaudeCodeParser';
