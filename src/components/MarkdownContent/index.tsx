import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import remarkBreaks from 'remark-breaks';

interface MarkdownContentProps {
  content: string;
}

/** 处理转义字符，将 \n \t 等转换为真正的换行和制表符 */
function unescapeString(str: string): string {
  return str.replace(/\\n/g, '\n').replace(/\\t/g, '\t').replace(/\\r/g, '\r');
}

export function MarkdownContent({ content }: MarkdownContentProps) {
  const unescaped = unescapeString(content);
  return (
    <div className="markdown-content">
      <ReactMarkdown remarkPlugins={[remarkGfm, remarkBreaks]}>{unescaped}</ReactMarkdown>
    </div>
  );
}
