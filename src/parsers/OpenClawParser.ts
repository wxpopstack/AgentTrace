import type { ParsedMessage, ContentItem, ContentBlock, OpenClawRecord } from '../types/message';
import type { JsonlParser, ParseResult } from './types';

/** 解析后的记录（包含原始文本和行号） */
interface ParsedRecord {
  raw: string;
  lineNo: number;
  data: OpenClawRecord;
}

/** 判断记录是否应该被忽略 */
function shouldSkipRecord(data: OpenClawRecord): boolean {
  // session: 会话元数据
  if (data.type === 'session') return true;

  // model_change: 模型切换记录
  if (data.type === 'model_change') return true;

  // thinking_level_change: thinking 级别变更
  if (data.type === 'thinking_level_change') return true;

  // custom: 自定义类型（如 model-snapshot）
  if (data.type === 'custom') return true;

  return false;
}

/**
 * OpenClaw JSONL 解析器
 * 特点：
 * - assistant 消息的 content 数组包含多个类型（text, thinking, toolCall）
 * - toolResult 是单独的消息行，需要合并连续的 toolResult
 */
export class OpenClawParser implements JsonlParser {
  parse(lines: string[]): ParseResult {
    const records: ParsedRecord[] = [];
    const failedLines: { raw: string; lineNo: number }[] = [];
    let unknownCount = 0;

    // 解析 JSONL 行，保留原始文本和行号（1-based）
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      if (!line.trim()) continue;
      try {
        const data = JSON.parse(line) as OpenClawRecord;
        records.push({ raw: line, lineNo: i + 1, data });
      } catch {
        failedLines.push({ raw: line, lineNo: i + 1 });
        unknownCount++;
      }
    }

    // 建立 toolCallId -> { name, arguments } 映射
    const toolCallMap: Record<string, { name: string; arguments: string }> = {};
    for (const { data } of records) {
      const msg = data.message;
      if (!msg) continue;

      // 处理 content 数组里的 toolCall
      if (Array.isArray(msg.content)) {
        for (const item of msg.content) {
          if (item.type === 'toolCall' && item.id) {
            const args =
              typeof item.arguments === 'string'
                ? item.arguments
                : JSON.stringify(item.arguments || item.input || {});
            toolCallMap[item.id] = { name: item.name, arguments: args };
          }
        }
      }

      // 处理 tool_calls
      for (const tc of msg.tool_calls || []) {
        if (tc.id) {
          if (tc.function) {
            toolCallMap[tc.id] = { name: tc.function.name, arguments: tc.function.arguments };
          } else if (tc.name) {
            const args =
              typeof tc.arguments === 'string'
                ? tc.arguments
                : JSON.stringify(tc.arguments || tc.input || {});
            toolCallMap[tc.id] = { name: tc.name, arguments: args };
          }
        }
      }
    }

    // 解析为可渲染消息
    const parsed: ParsedMessage[] = [];

    let i = 0;
    while (i < records.length) {
      const { raw, lineNo, data } = records[i];
      const msgType = data.type;

      // 跳过应该忽略的记录
      if (shouldSkipRecord(data)) {
        i++;
        continue;
      }

      // 非消息类型
      if (msgType !== 'message') {
        parsed.push(this.createUnknownMessage(raw, lineNo, data, `不支持的类型: ${msgType}`));
        unknownCount++;
        i++;
        continue;
      }

      const role = data.message?.role || 'unknown';

      // 合并连续的 toolResult
      if (role === 'toolResult') {
        const toolResults: ParsedRecord[] = [{ raw, lineNo, data }];
        let j = i + 1;
        while (j < records.length && records[j].data.message?.role === 'toolResult') {
          toolResults.push(records[j]);
          j++;
        }
        const merged = this.mergeToolResults(toolResults, toolCallMap);
        if (merged) {
          parsed.push(merged);
        } else {
          parsed.push(this.createUnknownMessage(raw, lineNo, data, 'toolResult 解析失败'));
          unknownCount++;
        }
        i = j;
        continue;
      }

      // assistant 消息
      if (role === 'assistant') {
        const msg = this.parseAssistantMessage(raw, lineNo, data);
        if (msg) {
          parsed.push(msg);
        } else {
          parsed.push(this.createUnknownMessage(raw, lineNo, data, 'assistant 解析失败'));
          unknownCount++;
        }
        i++;
        continue;
      }

      // user 消息
      if (role === 'user') {
        const msg = this.parseUserMessage(raw, lineNo, data);
        if (msg) {
          parsed.push(msg);
        } else {
          parsed.push(this.createUnknownMessage(raw, lineNo, data, 'user 解析失败'));
          unknownCount++;
        }
        i++;
        continue;
      }

      // 其他 role
      parsed.push(this.createUnknownMessage(raw, lineNo, data, `不支持的 role: ${role}`));
      unknownCount++;
      i++;
    }

    // JSON 解析失败的行
    for (const { raw, lineNo } of failedLines) {
      parsed.push({
        id: `unknown-json-${parsed.length}`,
        role: 'unknown',
        name: 'Unknown',
        avatar: '❓',
        timestamp: '',
        rawLines: [raw],
        lineNumbers: [lineNo],
        contentBlocks: [{ type: 'text', text: 'JSON 解析失败，请查看原文' }],
      });
    }

    return { messages: parsed, failedCount: unknownCount };
  }

  private createUnknownMessage(
    raw: string,
    lineNo: number,
    data: OpenClawRecord,
    text: string
  ): ParsedMessage {
    return {
      id: `unknown-${data.id || Date.now()}`,
      role: 'unknown',
      name: 'Unknown',
      avatar: '❓',
      timestamp: data.timestamp || '',
      rawLines: [raw],
      lineNumbers: [lineNo],
      contentBlocks: [{ type: 'text', text }],
    };
  }

  private parseAssistantMessage(
    raw: string,
    lineNo: number,
    data: OpenClawRecord
  ): ParsedMessage | null {
    const msg = data.message;
    if (!msg) return null;

    const timestamp = data.timestamp || '';
    const contentBlocks: ContentBlock[] = [];

    // 检查是否有错误消息
    const errorMsg = (msg as { errorMessage?: string }).errorMessage;

    if (Array.isArray(msg.content)) {
      for (const item of msg.content) {
        if (item.type === 'text') {
          contentBlocks.push({ type: 'text', text: item.text });
        } else if (item.type === 'thinking') {
          contentBlocks.push({ type: 'thinking', content: item.thinking });
        } else if (item.type === 'toolCall') {
          const args =
            typeof item.arguments === 'string'
              ? item.arguments
              : JSON.stringify(item.arguments || item.input || {});
          contentBlocks.push({ type: 'toolCalls', calls: [{ name: item.name, arguments: args }] });
        }
      }
    }

    // 如果 content 为空但有错误消息，显示错误
    if (contentBlocks.length === 0 && errorMsg) {
      contentBlocks.push({ type: 'text', text: `⚠️ 错误: ${errorMsg}` });
    }

    if (contentBlocks.length === 0) return null;

    return {
      id: data.id || `assistant-${timestamp}`,
      role: 'assistant',
      name: 'Assistant',
      avatar: '🤖',
      timestamp,
      rawLines: [raw],
      lineNumbers: [lineNo],
      contentBlocks,
    };
  }

  private parseUserMessage(
    raw: string,
    lineNo: number,
    data: OpenClawRecord
  ): ParsedMessage | null {
    const msg = data.message;
    if (!msg) return null;

    const timestamp = data.timestamp || '';
    const contentBlocks: ContentBlock[] = [];

    if (typeof msg.content === 'string' && msg.content) {
      contentBlocks.push({ type: 'text', text: msg.content });
    } else if (Array.isArray(msg.content)) {
      for (const item of msg.content) {
        if (item.type === 'text') {
          contentBlocks.push({ type: 'text', text: item.text });
        }
      }
    }

    if (contentBlocks.length === 0) return null;

    return {
      id: data.id || `user-${timestamp}`,
      role: 'user',
      name: 'User',
      avatar: '👤',
      timestamp,
      rawLines: [raw],
      lineNumbers: [lineNo],
      contentBlocks,
    };
  }

  private mergeToolResults(
    records: ParsedRecord[],
    toolCallMap: Record<string, { name: string; arguments: string }>
  ): ParsedMessage | null {
    if (records.length === 0) return null;

    const timestamp = records[0].data.timestamp || '';
    const rawLines = records.map((r) => r.raw);
    const lineNumbers = records.map((r) => r.lineNo);
    const contentBlocks: ContentBlock[] = [];

    for (const { data } of records) {
      const msg = data.message;
      if (!msg) continue;

      const toolInfo = msg.toolCallId ? toolCallMap[msg.toolCallId] : null;
      const toolName = toolInfo?.name || 'unknown';
      const toolArgs = toolInfo?.arguments || '';

      let content = '';
      if (typeof msg.content === 'string') {
        content = msg.content;
      } else if (Array.isArray(msg.content)) {
        const parts = msg.content
          .filter((c: ContentItem) => c.type === 'text')
          .map((c: ContentItem & { type: 'text' }) => c.text);
        content = parts.join('\n');
      }

      contentBlocks.push({ type: 'toolResult', toolName, toolArgs, content });
    }

    if (contentBlocks.length === 0) return null;

    return {
      id: `tool-results-${records[0].data.id || timestamp}`,
      role: 'toolResult',
      name: 'Tool Results',
      avatar: '🛠️',
      timestamp,
      rawLines,
      lineNumbers,
      contentBlocks,
    };
  }
}
