import { useState } from 'react';

interface JsonRawProps {
  lines: string[];
  lineNumbers: number[];
}

export function JsonRaw({ lines, lineNumbers }: JsonRawProps) {
  const [copiedIndex, setCopiedIndex] = useState<number | null>(null);

  const handleCopy = async (index: number, content: string) => {
    try {
      await navigator.clipboard.writeText(content);
      setCopiedIndex(index);
      setTimeout(() => setCopiedIndex(null), 2000);
    } catch (err) {
      console.error('Failed to copy:', err);
    }
  };

  return (
    <div className="json-raw-container">
      {lines.map((line, i) => {
        const lineNo = lineNumbers[i];
        const formatted = (() => {
          try {
            return JSON.stringify(JSON.parse(line), null, 2);
          } catch {
            return line;
          }
        })();

        return (
          <div key={i} className="json-raw-block">
            <div className="json-raw-header">
              <span className="json-line-number">#{lineNo}</span>
              <button className="copy-btn" onClick={() => handleCopy(i, formatted)} title="复制">
                {copiedIndex === i ? '✓' : '📋'}
              </button>
            </div>
            <hr className="json-divider" />
            <pre className="json-code-block">{formatted}</pre>
          </div>
        );
      })}
    </div>
  );
}
