import type { ParsedMessage } from '../types/message';

/**
 * 解析结果
 */
export interface ParseResult {
  messages: ParsedMessage[];
  failedCount: number;
}

/**
 * JSONL 解析器接口
 */
export interface JsonlParser {
  parse(lines: string[]): ParseResult;
}
