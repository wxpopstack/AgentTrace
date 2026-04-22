import { useState } from 'react';
import type { ParsedMessage, ContentBlock } from '../../types/message';
import { ThinkingBlock } from '../ThinkingBlock';
import { ToolExpander } from '../ToolExpander';
import { JsonRaw } from '../JsonRaw';
import { MarkdownContent } from '../MarkdownContent';
import { cn } from '../../utils/cn';
import { formatTimestamp } from '../../utils/format';

interface ChatMessageProps {
  message: ParsedMessage;
}

/** 截断参数显示，最大长度100字符 */
function truncateArgs(args: string, maxLen = 100): string {
  if (!args) return '';
  // 尝试格式化 JSON
  try {
    const parsed = JSON.parse(args);
    const formatted = JSON.stringify(parsed);
    if (formatted.length <= maxLen) return formatted;
    return formatted.slice(0, maxLen) + '...';
  } catch {
    if (args.length <= maxLen) return args;
    return args.slice(0, maxLen) + '...';
  }
}

/** 格式化工具标题，包含参数 */
function formatToolTitle(name: string, args: string): string {
  const truncated = truncateArgs(args);
  return truncated ? `📤 ${name}: ${truncated}` : `📤 ${name}`;
}

/** 渲染有序的内容块 */
function renderContentBlocks(blocks: ContentBlock[]): React.ReactNode {
  return blocks.map((block, i) => {
    switch (block.type) {
      case 'text':
        return (
          <div key={i} className="message-content">
            <MarkdownContent content={block.text} />
          </div>
        );
      case 'thinking':
        return <ThinkingBlock key={i} content={block.content} />;
      case 'toolCalls':
        return (
          <ToolExpander
            key={i}
            title="🔍 工具调用"
            items={block.calls.map((c) => `${c.name}: ${c.arguments}`)}
            threshold={500}
          />
        );
      case 'toolResult':
        return (
          <ToolExpander
            key={i}
            title={formatToolTitle(block.toolName, block.toolArgs)}
            content={block.content}
            threshold={500}
          />
        );
      case 'skillListing':
        return (
          <details key={i} className="skill-listing">
            <summary>📋 可用技能 ({block.skillCount}个)</summary>
            <div className="skill-listing-content">{block.skills}</div>
          </details>
        );
      case 'taskReminder':
        return (
          <details key={i} className="task-reminder">
            <summary>📝 当前任务 ({block.tasks.length}个)</summary>
            <div className="task-reminder-content">
              {block.tasks.map((task) => (
                <div key={task.id} className={`task-item task-${task.status}`}>
                  <span className="task-status">
                    {task.status === 'completed'
                      ? '✅'
                      : task.status === 'in_progress'
                        ? '🔄'
                        : '⏳'}
                  </span>
                  <span className="task-subject">{task.subject}</span>
                  {task.description && <span className="task-desc">{task.description}</span>}
                </div>
              ))}
            </div>
          </details>
        );
      case 'fileAttachment':
        return (
          <details key={i} className="file-attachment">
            <summary>📄 {block.filename}</summary>
            <pre className="file-attachment-content">{block.content}</pre>
          </details>
        );
    }
  });
}

export function ChatMessage({ message }: ChatMessageProps) {
  const [showRaw, setShowRaw] = useState(false);

  const timeStr = formatTimestamp(message.timestamp);

  return (
    <div className={cn('chat-message', `role-${message.role}`)} data-message-id={message.id}>
      <div className="message-header">
        <span className="avatar">{message.avatar}</span>
        <span className="name">{message.name}</span>
        <span className="timestamp">{timeStr}</span>
        <button className="toggle-btn" onClick={() => setShowRaw(!showRaw)}>
          {showRaw ? '可视化' : '原文'}
        </button>
      </div>

      <div className="message-body">
        {showRaw ? (
          <JsonRaw lines={message.rawLines} lineNumbers={message.lineNumbers} />
        ) : (
          renderContentBlocks(message.contentBlocks)
        )}
      </div>
    </div>
  );
}
