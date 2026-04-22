/**
 * 格式化工具函数
 */

/**
 * 时间戳格式化为本地时间
 */
export function formatTimestamp(timestamp: string): string {
  if (!timestamp) return '';

  try {
    if (timestamp.includes('T')) {
      const date = new Date(timestamp);
      return date.toLocaleString('zh-CN', {
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
      });
    }
    return timestamp;
  } catch {
    return timestamp;
  }
}

/**
 * 尝试格式化 JSON，失败返回 null
 */
export function formatJson(content: string): string | null {
  const stripped = content.trim();
  if (!stripped.startsWith('{') && !stripped.startsWith('[')) {
    return null;
  }

  try {
    const parsed = JSON.parse(stripped);
    return JSON.stringify(parsed, null, 2);
  } catch {
    return null;
  }
}
