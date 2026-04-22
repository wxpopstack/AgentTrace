import type { ParsedMessage, ContentItem, ContentBlock, ClaudeCodeRecord } from '../types/message';
import type { JsonlParser, ParseResult } from './types';

/** 解析后的记录（包含原始文本和行号） */
interface ParsedRecord {
  raw: string;
  lineNo: number;
  data: ClaudeCodeRecord;
}

/** 判断记录是否是 tool_result */
function isToolResultRecord(record: ClaudeCodeRecord): boolean {
  return (
    record.type === 'user' &&
    Array.isArray(record.message?.content) &&
    record.message?.content?.some?.((c) => c.type === 'tool_result')
  );
}

/** 判断记录是否是普通 user 消息 */
function isPlainUserRecord(record: ClaudeCodeRecord): boolean {
  return record.type === 'user' && !isToolResultRecord(record);
}

/** 判断记录是否应该被忽略 */
function shouldSkipRecord(record: ClaudeCodeRecord): boolean {
  // permission-mode: 权限模式配置
  if (record.type === 'permission-mode') return true;

  // last-prompt: 最后一条 prompt 记录（元数据）
  if (record.type === 'last-prompt') return true;

  // file-history-snapshot: 文件状态快照
  if (record.type === 'file-history-snapshot') return true;

  // queue-operation: 任务队列操作日志
  if (record.type === 'queue-operation') return true;

  // attachment + task_reminder + itemCount: 0: 空任务提醒
  if (record.type === 'attachment') {
    const attachment = (
      record as ClaudeCodeRecord & { attachment?: { type?: string; itemCount?: number } }
    ).attachment;
    if (attachment?.type === 'task_reminder' && attachment?.itemCount === 0) return true;
    // edited_text_file: 文件编辑片段记录
    if (attachment?.type === 'edited_text_file') return true;
  }

  // isMeta: true 的元数据消息
  if (record.isMeta) return true;

  // system + local_command: 命令执行输出
  if (record.type === 'system' && record.subtype === 'local_command') return true;

  return false;
}

/** 判断记录是否是统计摘要 */
function isStatsRecord(record: ClaudeCodeRecord): boolean {
  return record.type === 'system' && record.subtype === 'turn_duration';
}

/** 判断记录是否是技能列表 */
function isSkillListingRecord(record: ClaudeCodeRecord): boolean {
  if (record.type !== 'attachment') return false;
  const attachment = (record as ClaudeCodeRecord & { attachment?: { type?: string } }).attachment;
  return attachment?.type === 'skill_listing';
}

/** 判断记录是否是 API 错误 */
function isApiErrorRecord(record: ClaudeCodeRecord): boolean {
  return record.type === 'system' && record.subtype === 'api_error';
}

/** 判断记录是否是任务提醒（非空） */
function isTaskReminderRecord(record: ClaudeCodeRecord): boolean {
  if (record.type !== 'attachment') return false;
  const attachment = (
    record as ClaudeCodeRecord & { attachment?: { type?: string; itemCount?: number } }
  ).attachment;
  return attachment?.type === 'task_reminder' && (attachment?.itemCount ?? 0) > 0;
}

/** 判断记录是否是文件附件 */
function isFileAttachmentRecord(record: ClaudeCodeRecord): boolean {
  if (record.type !== 'attachment') return false;
  const attachment = (record as ClaudeCodeRecord & { attachment?: { type?: string } }).attachment;
  return attachment?.type === 'file';
}

/** 判断记录是否是计划模式 */
function isPlanModeRecord(record: ClaudeCodeRecord): boolean {
  if (record.type !== 'attachment') return false;
  const attachment = (record as ClaudeCodeRecord & { attachment?: { type?: string } }).attachment;
  return attachment?.type === 'plan_mode';
}

/** 判断记录是否是退出计划模式 */
function isPlanModeExitRecord(record: ClaudeCodeRecord): boolean {
  if (record.type !== 'attachment') return false;
  const attachment = (record as ClaudeCodeRecord & { attachment?: { type?: string } }).attachment;
  return attachment?.type === 'plan_mode_exit';
}

/** 判断记录是否是排队命令 */
function isQueuedCommandRecord(record: ClaudeCodeRecord): boolean {
  if (record.type !== 'attachment') return false;
  const attachment = (record as ClaudeCodeRecord & { attachment?: { type?: string } }).attachment;
  return attachment?.type === 'queued_command';
}

/** 判断记录是否是离开摘要 */
function isAwaySummaryRecord(record: ClaudeCodeRecord): boolean {
  return record.type === 'system' && record.subtype === 'away_summary';
}

/** 判断记录是否是压缩边界 */
function isCompactBoundaryRecord(record: ClaudeCodeRecord): boolean {
  return record.type === 'system' && record.subtype === 'compact_boundary';
}

/** 系统消息记录的扩展类型（包含 content 字段） */
interface SystemContentRecord extends ClaudeCodeRecord {
  content?: string;
  compactMetadata?: {
    trigger?: string;
    preTokens?: number;
    postTokens?: number;
    durationMs?: number;
  };
}

/** API 错误记录的扩展类型 */
interface ApiErrorRecord extends ClaudeCodeRecord {
  cause?: {
    code?: string;
    path?: string;
    errno?: number;
  };
  error?: {
    type?: string | null;
    cause?: {
      code?: string;
      path?: string;
    };
  };
  retryInMs?: number;
  retryAttempt?: number;
  maxRetries?: number;
}

/**
 * Claude Code JSONL 解析器
 * 特点：每个内容类型是一行，需要按 message.id 合并 assistant 行，合并连续的 tool_result
 */
export class ClaudeCodeParser implements JsonlParser {
  parse(lines: string[]): ParseResult {
    const records: ParsedRecord[] = [];
    const failedLines: { raw: string; lineNo: number }[] = [];
    let unknownCount = 0;

    // 解析 JSONL 行，保留原始文本和行号（1-based）
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      if (!line.trim()) continue;
      try {
        const data = JSON.parse(line) as ClaudeCodeRecord;
        records.push({ raw: line, lineNo: i + 1, data });
      } catch {
        failedLines.push({ raw: line, lineNo: i + 1 });
        unknownCount++;
      }
    }

    // 构建 tool_use_id -> { name, arguments } 映射
    const toolCallMap: Record<string, { name: string; arguments: string }> = {};
    for (const { data } of records) {
      if (data.type === 'assistant' && data.message?.content) {
        for (const item of data.message.content) {
          if ((item.type === 'tool_use' || item.type === 'toolCall') && item.id) {
            const args =
              typeof item.arguments === 'string'
                ? item.arguments
                : JSON.stringify(item.input || {});
            toolCallMap[item.id] = { name: item.name, arguments: args };
          }
        }
      }
    }

    // 按 message.id 分组 assistant 消息
    const assistantGroups: Map<string, ParsedRecord[]> = new Map();
    for (const record of records) {
      if (record.data.type === 'assistant' && record.data.message?.id) {
        const msgId = record.data.message.id;
        if (!assistantGroups.has(msgId)) {
          assistantGroups.set(msgId, []);
        }
        assistantGroups.get(msgId)!.push(record);
      }
    }

    // 解析为可渲染消息
    const parsed: ParsedMessage[] = [];
    const processedIndices: Set<number> = new Set();

    for (let idx = 0; idx < records.length; idx++) {
      if (processedIndices.has(idx)) continue;

      const { raw, lineNo, data } = records[idx];

      // 跳过应该忽略的记录
      if (shouldSkipRecord(data)) {
        processedIndices.add(idx);
        continue;
      }

      // 统计摘要
      if (isStatsRecord(data)) {
        processedIndices.add(idx);
        const msg = this.parseStatsMessage(raw, lineNo, data);
        if (msg) {
          parsed.push(msg);
        }
        continue;
      }

      // 技能列表
      if (isSkillListingRecord(data)) {
        processedIndices.add(idx);
        const msg = this.parseSkillListing(raw, lineNo, data);
        if (msg) {
          parsed.push(msg);
        }
        continue;
      }

      // API 错误
      if (isApiErrorRecord(data)) {
        processedIndices.add(idx);
        const msg = this.parseApiError(raw, lineNo, data);
        if (msg) {
          parsed.push(msg);
        }
        continue;
      }

      // 任务提醒
      if (isTaskReminderRecord(data)) {
        processedIndices.add(idx);
        const msg = this.parseTaskReminder(raw, lineNo, data);
        if (msg) {
          parsed.push(msg);
        }
        continue;
      }

      // 离开摘要
      if (isAwaySummaryRecord(data)) {
        processedIndices.add(idx);
        const msg = this.parseAwaySummary(raw, lineNo, data);
        if (msg) {
          parsed.push(msg);
        }
        continue;
      }

      // 压缩边界
      if (isCompactBoundaryRecord(data)) {
        processedIndices.add(idx);
        const msg = this.parseCompactBoundary(raw, lineNo, data);
        if (msg) {
          parsed.push(msg);
        }
        continue;
      }

      // 文件附件
      if (isFileAttachmentRecord(data)) {
        processedIndices.add(idx);
        const msg = this.parseFileAttachment(raw, lineNo, data);
        if (msg) {
          parsed.push(msg);
        }
        continue;
      }

      // 计划模式
      if (isPlanModeRecord(data)) {
        processedIndices.add(idx);
        const msg = this.parsePlanMode(raw, lineNo, data);
        if (msg) {
          parsed.push(msg);
        }
        continue;
      }

      // 退出计划模式
      if (isPlanModeExitRecord(data)) {
        processedIndices.add(idx);
        const msg = this.parsePlanModeExit(raw, lineNo, data);
        if (msg) {
          parsed.push(msg);
        }
        continue;
      }

      // 排队命令
      if (isQueuedCommandRecord(data)) {
        processedIndices.add(idx);
        const msg = this.parseQueuedCommand(raw, lineNo, data);
        if (msg) {
          parsed.push(msg);
        }
        continue;
      }

      // assistant 消息：合并同组记录
      if (data.type === 'assistant' && data.message?.id) {
        const group = assistantGroups.get(data.message.id);
        if (group) {
          const merged = this.mergeAssistantGroup(data.message.id, group);
          if (merged) {
            parsed.push(merged);
          } else {
            parsed.push(this.createUnknownMessage(raw, lineNo, data, 'assistant 解析失败'));
            unknownCount++;
          }
          // 标记组内所有记录为已处理
          for (const r of group) {
            const rIdx = records.indexOf(r);
            if (rIdx >= 0) processedIndices.add(rIdx);
          }
        }
        continue;
      }

      // tool_result：合并连续的
      if (isToolResultRecord(data)) {
        const toolResults: ParsedRecord[] = [{ raw, lineNo, data }];
        processedIndices.add(idx);
        let j = idx + 1;
        while (j < records.length && isToolResultRecord(records[j].data)) {
          toolResults.push(records[j]);
          processedIndices.add(j);
          j++;
        }
        const merged = this.mergeToolResults(toolResults, toolCallMap);
        if (merged) {
          parsed.push(merged);
        } else {
          parsed.push(this.createUnknownMessage(raw, lineNo, data, 'tool_result 解析失败'));
          unknownCount++;
        }
        continue;
      }

      // 普通 user 消息
      if (isPlainUserRecord(data)) {
        processedIndices.add(idx);
        const msg = this.parsePlainUserMessage(raw, lineNo, data);
        if (msg) {
          parsed.push(msg);
        } else {
          parsed.push(this.createUnknownMessage(raw, lineNo, data, 'user 消息解析失败'));
          unknownCount++;
        }
        continue;
      }

      // 其他类型
      processedIndices.add(idx);
      parsed.push(this.createUnknownMessage(raw, lineNo, data, `不支持的类型: ${data.type}`));
      unknownCount++;
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
    data: ClaudeCodeRecord,
    text: string
  ): ParsedMessage {
    return {
      id: `unknown-${data.uuid || Date.now()}`,
      role: 'unknown',
      name: 'Unknown',
      avatar: '❓',
      timestamp: data.timestamp || '',
      rawLines: [raw],
      lineNumbers: [lineNo],
      contentBlocks: [{ type: 'text', text }],
    };
  }

  private parseStatsMessage(
    raw: string,
    lineNo: number,
    data: ClaudeCodeRecord
  ): ParsedMessage | null {
    const durationMs = (data as ClaudeCodeRecord & { durationMs?: number; messageCount?: number })
      .durationMs;
    const messageCount = (data as ClaudeCodeRecord & { durationMs?: number; messageCount?: number })
      .messageCount;

    if (!durationMs) return null;

    const seconds = Math.floor(durationMs / 1000);
    const minutes = Math.floor(seconds / 60);
    const remainingSeconds = seconds % 60;

    const durationText = minutes > 0 ? `${minutes}m${remainingSeconds}s` : `${seconds}s`;

    const text = messageCount
      ? `📊 本次回复耗时 ${durationText}，生成 ${messageCount} 条消息`
      : `📊 本次回复耗时 ${durationText}`;

    return {
      id: data.uuid || `stats-${data.timestamp}`,
      role: 'stats',
      name: 'Stats',
      avatar: '📊',
      timestamp: data.timestamp || '',
      rawLines: [raw],
      lineNumbers: [lineNo],
      contentBlocks: [{ type: 'text', text }],
    };
  }

  private parseSkillListing(
    raw: string,
    lineNo: number,
    data: ClaudeCodeRecord
  ): ParsedMessage | null {
    const attachment = (
      data as ClaudeCodeRecord & {
        attachment?: { type?: string; content?: string; skillCount?: number };
      }
    ).attachment;

    if (!attachment || attachment.type !== 'skill_listing') return null;

    return {
      id: data.uuid || `skills-${data.timestamp}`,
      role: 'system',
      name: 'Skills',
      avatar: '📋',
      timestamp: data.timestamp || '',
      rawLines: [raw],
      lineNumbers: [lineNo],
      contentBlocks: [
        {
          type: 'skillListing',
          skills: attachment.content || '',
          skillCount: attachment.skillCount || 0,
        },
      ],
    };
  }

  private parseApiError(raw: string, lineNo: number, data: ClaudeCodeRecord): ParsedMessage | null {
    const errorData = data as ApiErrorRecord;

    // 提取错误信息
    const errorCode = errorData.cause?.code || errorData.error?.cause?.code || 'Unknown';
    const errorPath = errorData.cause?.path || errorData.error?.cause?.path || '';
    const retryAttempt = errorData.retryAttempt || 0;
    const maxRetries = errorData.maxRetries || 0;

    // 构建简洁的错误摘要
    const retryText = maxRetries > 0 ? ` (重试 ${retryAttempt}/${maxRetries})` : '';
    const pathText = errorPath ? ` → ${errorPath.split('?')[0]}` : ''; // 移除查询参数
    const text = `⚠️ API 错误: ${errorCode}${pathText}${retryText}`;

    return {
      id: data.uuid || `api-error-${data.timestamp}`,
      role: 'system',
      name: 'API Error',
      avatar: '⚠️',
      timestamp: data.timestamp || '',
      rawLines: [raw],
      lineNumbers: [lineNo],
      contentBlocks: [{ type: 'text', text }],
    };
  }

  private parseTaskReminder(
    raw: string,
    lineNo: number,
    data: ClaudeCodeRecord
  ): ParsedMessage | null {
    const attachment = (
      data as ClaudeCodeRecord & {
        attachment?: {
          type?: string;
          content?: Array<{
            id: string;
            subject: string;
            description?: string;
            status: string;
          }>;
          itemCount?: number;
        };
      }
    ).attachment;

    if (!attachment || attachment.type !== 'task_reminder') return null;

    const tasks = (attachment.content || []).map((item) => ({
      id: item.id,
      subject: item.subject,
      description: item.description,
      status: item.status as 'pending' | 'in_progress' | 'completed',
    }));

    if (tasks.length === 0) return null;

    return {
      id: data.uuid || `tasks-${data.timestamp}`,
      role: 'system',
      name: 'Tasks',
      avatar: '📝',
      timestamp: data.timestamp || '',
      rawLines: [raw],
      lineNumbers: [lineNo],
      contentBlocks: [{ type: 'taskReminder', tasks }],
    };
  }

  private parseAwaySummary(
    raw: string,
    lineNo: number,
    data: ClaudeCodeRecord
  ): ParsedMessage | null {
    const systemData = data as SystemContentRecord;
    const content = systemData.content;

    if (!content) return null;

    return {
      id: data.uuid || `away-${data.timestamp}`,
      role: 'system',
      name: 'Away Summary',
      avatar: '💤',
      timestamp: data.timestamp || '',
      rawLines: [raw],
      lineNumbers: [lineNo],
      contentBlocks: [{ type: 'text', text: `📋 ${content}` }],
    };
  }

  private parseCompactBoundary(
    raw: string,
    lineNo: number,
    data: ClaudeCodeRecord
  ): ParsedMessage | null {
    const systemData = data as SystemContentRecord;
    const metadata = systemData.compactMetadata;

    // 构建压缩摘要信息
    let text = '🔄 对话已压缩';
    if (metadata) {
      const preTokens = metadata.preTokens || 0;
      const postTokens = metadata.postTokens || 0;
      const reduction = preTokens > 0 ? Math.round((1 - postTokens / preTokens) * 100) : 0;
      const duration = metadata.durationMs ? Math.round(metadata.durationMs / 1000) : 0;
      const trigger = metadata.trigger || 'auto';

      text = `🔄 对话压缩 (${trigger}): ${preTokens} → ${postTokens} tokens (节省 ${reduction}%, 耗时 ${duration}s)`;
    }

    return {
      id: data.uuid || `compact-${data.timestamp}`,
      role: 'system',
      name: 'Compact',
      avatar: '🔄',
      timestamp: data.timestamp || '',
      rawLines: [raw],
      lineNumbers: [lineNo],
      contentBlocks: [{ type: 'text', text }],
    };
  }

  private parseFileAttachment(
    raw: string,
    lineNo: number,
    data: ClaudeCodeRecord
  ): ParsedMessage | null {
    const attachment = (
      data as ClaudeCodeRecord & {
        attachment?: {
          type?: string;
          filename?: string;
          content?: {
            type?: string;
            file?: {
              filePath?: string;
              content?: string;
            };
          };
        };
      }
    ).attachment;

    if (!attachment || attachment.type !== 'file') return null;

    const filename = attachment.filename || '';
    const fileContent = attachment.content?.file?.content || '';

    if (!filename) return null;

    return {
      id: data.uuid || `file-${data.timestamp}`,
      role: 'system',
      name: 'File',
      avatar: '📄',
      timestamp: data.timestamp || '',
      rawLines: [raw],
      lineNumbers: [lineNo],
      contentBlocks: [{ type: 'fileAttachment', filename, content: fileContent }],
    };
  }

  private parsePlanMode(raw: string, lineNo: number, data: ClaudeCodeRecord): ParsedMessage | null {
    const attachment = (
      data as ClaudeCodeRecord & {
        attachment?: {
          type?: string;
          reminderType?: string;
          isSubAgent?: boolean;
          planFilePath?: string;
          planExists?: boolean;
        };
      }
    ).attachment;

    if (!attachment || attachment.type !== 'plan_mode') return null;

    const planFilePath = attachment.planFilePath || '';
    const planExists = attachment.planExists;
    const isSubAgent = attachment.isSubAgent;

    // 构建计划模式提示信息
    let text = '📋 进入计划模式';
    if (planFilePath) {
      text += ` (${planFilePath.split('/').pop()})`;
    }
    if (!planExists) {
      text += ' - 新计划';
    }
    if (isSubAgent) {
      text += ' [子代理]';
    }

    return {
      id: data.uuid || `plan-${data.timestamp}`,
      role: 'system',
      name: 'Plan Mode',
      avatar: '📋',
      timestamp: data.timestamp || '',
      rawLines: [raw],
      lineNumbers: [lineNo],
      contentBlocks: [{ type: 'text', text }],
    };
  }

  private parsePlanModeExit(
    raw: string,
    lineNo: number,
    data: ClaudeCodeRecord
  ): ParsedMessage | null {
    const attachment = (
      data as ClaudeCodeRecord & {
        attachment?: {
          type?: string;
          planFilePath?: string;
          planExists?: boolean;
        };
      }
    ).attachment;

    if (!attachment || attachment.type !== 'plan_mode_exit') return null;

    const planFilePath = attachment.planFilePath || '';
    const planExists = attachment.planExists;

    let text = '📋 退出计划模式';
    if (planFilePath) {
      text += ` (${planFilePath.split('/').pop()})`;
    }
    if (planExists) {
      text += ' - 计划已保存';
    }

    return {
      id: data.uuid || `plan-exit-${data.timestamp}`,
      role: 'system',
      name: 'Plan Mode Exit',
      avatar: '✅',
      timestamp: data.timestamp || '',
      rawLines: [raw],
      lineNumbers: [lineNo],
      contentBlocks: [{ type: 'text', text }],
    };
  }

  private parseQueuedCommand(
    raw: string,
    lineNo: number,
    data: ClaudeCodeRecord
  ): ParsedMessage | null {
    const attachment = (
      data as ClaudeCodeRecord & {
        attachment?: {
          type?: string;
          prompt?: string;
          commandMode?: string;
        };
      }
    ).attachment;

    if (!attachment || attachment.type !== 'queued_command') return null;

    const prompt = attachment.prompt || '';
    const commandMode = attachment.commandMode || '';

    let text = '⏳ 排队命令';
    if (commandMode) {
      text += ` [${commandMode}]`;
    }
    if (prompt) {
      text += `: ${prompt}`;
    }

    return {
      id: data.uuid || `queued-${data.timestamp}`,
      role: 'system',
      name: 'Queued Command',
      avatar: '⏳',
      timestamp: data.timestamp || '',
      rawLines: [raw],
      lineNumbers: [lineNo],
      contentBlocks: [{ type: 'text', text }],
    };
  }

  private mergeAssistantGroup(msgId: string, group: ParsedRecord[]): ParsedMessage | null {
    if (group.length === 0) return null;

    const timestamp = group[0].data.timestamp || '';
    const rawLines = group.map((r) => r.raw);
    const lineNumbers = group.map((r) => r.lineNo);
    const contentBlocks: ContentBlock[] = [];

    // 合并所有 content
    for (const { data } of group) {
      if (data.message?.content) {
        for (const item of data.message.content) {
          if (item.type === 'text') {
            contentBlocks.push({ type: 'text', text: item.text });
          } else if (item.type === 'thinking') {
            contentBlocks.push({ type: 'thinking', content: item.thinking });
          } else if (item.type === 'tool_use') {
            const args =
              typeof item.arguments === 'string'
                ? item.arguments
                : JSON.stringify(item.input || {});
            contentBlocks.push({
              type: 'toolCalls',
              calls: [{ name: item.name, arguments: args }],
            });
          }
        }
      }
    }

    if (contentBlocks.length === 0) return null;

    return {
      id: msgId,
      role: 'assistant',
      name: 'Assistant',
      avatar: '🤖',
      timestamp,
      rawLines,
      lineNumbers,
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
      if (Array.isArray(data.message?.content)) {
        for (const item of data.message.content) {
          if (item.type === 'tool_result') {
            const toolInfo = toolCallMap[item.tool_use_id] || { name: 'unknown', arguments: '' };
            let content = '';
            if (typeof item.content === 'string') {
              content = item.content;
            } else if (Array.isArray(item.content)) {
              const parts = item.content
                .filter((c: ContentItem) => c.type === 'text')
                .map((c: ContentItem & { type: 'text' }) => c.text);
              content = parts.join('\n');
            } else {
              content = JSON.stringify(item.content);
            }
            contentBlocks.push({
              type: 'toolResult',
              toolName: toolInfo.name,
              toolArgs: toolInfo.arguments,
              content,
            });
          }
        }
      }
    }

    if (contentBlocks.length === 0) return null;

    return {
      id: `tool-results-${records[0].data.uuid}`,
      role: 'toolResult',
      name: 'Tool Results',
      avatar: '🛠️',
      timestamp,
      rawLines,
      lineNumbers,
      contentBlocks,
    };
  }

  private parsePlainUserMessage(
    raw: string,
    lineNo: number,
    data: ClaudeCodeRecord
  ): ParsedMessage | null {
    const timestamp = data.timestamp || '';
    const contentBlocks: ContentBlock[] = [];

    if (Array.isArray(data.message?.content)) {
      for (const item of data.message.content) {
        if (item.type === 'text') {
          contentBlocks.push({ type: 'text', text: item.text });
        }
      }
    } else if (typeof data.message?.content === 'string') {
      contentBlocks.push({ type: 'text', text: data.message.content });
    }

    if (contentBlocks.length === 0) return null;

    return {
      id: data.uuid || `user-${timestamp}`,
      role: 'user',
      name: 'User',
      avatar: '👤',
      timestamp,
      rawLines: [raw],
      lineNumbers: [lineNo],
      contentBlocks,
    };
  }
}
