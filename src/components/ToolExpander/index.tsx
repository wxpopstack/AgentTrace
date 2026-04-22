import { formatJson } from '../../utils/format';
import { MarkdownContent } from '../MarkdownContent';

interface ToolExpanderProps {
  title: string;
  content?: string;
  items?: string[];
  /** 内容长度阈值，低于此值默认展开 */
  threshold?: number;
}

/** 判断内容是否较短 */
function isShortContent(content: string | undefined, threshold: number): boolean {
  if (!content) return false;
  // 去除空白字符后计算长度
  const trimmed = content.replace(/\s+/g, ' ').trim();
  return trimmed.length < threshold;
}

/** 判断 items 是否较短 */
function isShortItems(items: string[] | undefined, threshold: number): boolean {
  if (!items || items.length === 0) return false;
  // 单个 item 且内容较短
  if (items.length === 1) {
    const trimmed = items[0].replace(/\s+/g, ' ').trim();
    return trimmed.length < threshold;
  }
  return false;
}

/** 处理转义字符，将 \n \t 等转换为真正的换行和制表符 */
function unescapeString(str: string): string {
  return str.replace(/\\n/g, '\n').replace(/\\t/g, '\t').replace(/\\r/g, '\r');
}

export function ToolExpander({ title, content, items, threshold = 200 }: ToolExpanderProps) {
  // 根据内容长度决定是否默认展开
  const shouldOpen = isShortContent(content, threshold) || isShortItems(items, threshold);

  return (
    <details className="tool-expander" open={shouldOpen}>
      <summary>{title}</summary>
      <div className="tool-content">
        {items &&
          items.map((item, i) => (
            <pre key={i} className="tool-item">
              {unescapeString(item)}
            </pre>
          ))}
        {content &&
          (() => {
            const unescaped = unescapeString(content);
            const formatted = formatJson(unescaped);
            return formatted ? (
              <pre className="json-content">{formatted}</pre>
            ) : (
              <MarkdownContent content={content} />
            );
          })()}
      </div>
    </details>
  );
}
