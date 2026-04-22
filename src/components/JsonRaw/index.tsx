interface JsonRawProps {
  lines: string[];
  lineNumbers: number[];
}

export function JsonRaw({ lines, lineNumbers }: JsonRawProps) {
  return (
    <pre className="json-raw">
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
          <div key={i} className="json-raw-line">
            <span className="line-number">{lineNo}</span>
            <span className="line-content">{formatted}</span>
          </div>
        );
      })}
    </pre>
  );
}
