interface ThinkingBlockProps {
  content: string;
  /** 内容长度阈值，超过此值默认折叠 */
  threshold?: number;
}

export function ThinkingBlock({ content, threshold = 500 }: ThinkingBlockProps) {
  // 内容超过阈值时默认折叠
  const shouldOpen = content.length < threshold;

  return (
    <details className="thinking-block" open={shouldOpen}>
      <summary>💭 思考过程</summary>
      <div className="thinking-content">{content}</div>
    </details>
  );
}
