import { useState, useCallback } from 'react';
import { invoke } from '@tauri-apps/api/core';
import type { ParsedMessage, SourceType } from '../types/message';
import { getParser } from '../parsers';

/**
 * 解析 JSONL 内容，根据来源类型选择解析器
 */
export function useJsonlParser() {
  const [messages, setMessages] = useState<ParsedMessage[]>([]);
  const [failedCount, setFailedCount] = useState(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const loadFile = useCallback(async (filePath: string, sourceType: SourceType = 'openclaw') => {
    setLoading(true);
    setMessages([]); // 先清空之前的消息
    setFailedCount(0);
    setError(null);
    try {
      const lines = await invoke<string[]>('read_jsonl_file', { filePath });
      const parser = getParser(sourceType, lines);
      const result = parser.parse(lines);
      setMessages(result.messages);
      setFailedCount(result.failedCount);
    } catch (e) {
      setError(String(e));
      setMessages([]);
      setFailedCount(0);
    } finally {
      setLoading(false);
    }
  }, []);

  const clearMessages = useCallback(() => {
    setMessages([]);
    setFailedCount(0);
    setError(null);
  }, []);

  return { messages, failedCount, loading, error, loadFile, clearMessages };
}
