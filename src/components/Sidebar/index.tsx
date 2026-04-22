import { useMemo } from 'react';
import { cn } from '../../utils/cn';
import type { FileInfo, DiscoveredItem, SourceType } from '../../types/message';

/**
 * 找出所有项目名称的公共前缀（以 - 分隔）
 * 例如: ['Users-john-projects-app1', 'Users-john-projects-app2'] -> 'Users-john-projects'
 */
function findCommonPrefix(names: string[]): string {
  if (names.length === 0) return '';
  if (names.length === 1) {
    // 单个项目，去掉最后一部分（项目名本身），保留路径
    const parts = names[0].split('-');
    if (parts.length > 1) {
      return parts.slice(0, -1).join('-');
    }
    return '';
  }

  const splitNames = names.map((n) => n.split('-'));
  const minLen = Math.min(...splitNames.map((p) => p.length));

  let commonParts = 0;
  for (let i = 0; i < minLen; i++) {
    const part = splitNames[0][i];
    if (splitNames.every((p) => p[i] === part)) {
      commonParts++;
    } else {
      break;
    }
  }

  return commonParts > 0 ? splitNames[0].slice(0, commonParts).join('-') : '';
}

interface SidebarProps {
  width: number;
  sourceType: SourceType;
  setSourceType: (type: SourceType) => void;
  openclawAgents: DiscoveredItem[];
  claudeProjects: DiscoveredItem[];
  selectedAgent: string | null;
  setSelectedAgent: (name: string) => void;
  selectedProject: string | null;
  setSelectedProject: (name: string) => void;
  customPath: string;
  setCustomPath: (path: string) => void;
  files: FileInfo[];
  selectedFile: string | null;
  loading: boolean;
  error: string | null;
  onScanCustom: () => void;
  onFileSelect: (file: { name: string; path: string }) => void;
}

export function Sidebar({
  width,
  sourceType,
  setSourceType,
  openclawAgents,
  claudeProjects,
  selectedAgent,
  setSelectedAgent,
  selectedProject,
  setSelectedProject,
  customPath,
  setCustomPath,
  files,
  selectedFile,
  loading,
  error,
  onScanCustom,
  onFileSelect,
}: SidebarProps) {
  // 计算 claude projects 的公共前缀
  const projectPrefix = useMemo(() => {
    return findCommonPrefix(claudeProjects.map((p) => p.name));
  }, [claudeProjects]);

  // 生成显示名称（去掉公共前缀）
  const getDisplayName = (name: string, prefix: string): string => {
    if (!prefix) return name;
    // 去掉前缀和随后的 '-'
    const trimmed = name.startsWith(prefix + '-') ? name.slice(prefix.length + 1) : name;
    return trimmed || name;
  };

  return (
    <aside className="sidebar" style={{ width }}>
      {/* Tab 切换 */}
      <div className="source-tabs">
        <div className="source-tabs-inner">
          <button
            className={cn('tab-btn', sourceType === 'openclaw' && 'active')}
            data-source="openclaw"
            onClick={() => setSourceType('openclaw')}
          >
            OpenClaw
          </button>
          <button
            className={cn('tab-btn', sourceType === 'claude-code' && 'active')}
            data-source="claude-code"
            onClick={() => setSourceType('claude-code')}
          >
            Claude Code
          </button>
          <button
            className={cn('tab-btn', sourceType === 'custom' && 'active')}
            data-source="custom"
            onClick={() => setSourceType('custom')}
          >
            自定义
          </button>
        </div>
      </div>

      {/* Agent/Project 选择器 */}
      {sourceType === 'openclaw' && (
        <div className="selector-section">
          <label>Agent:</label>
          <select
            value={selectedAgent || ''}
            onChange={(e) => setSelectedAgent(e.target.value)}
            disabled={openclawAgents.length === 0}
          >
            {openclawAgents.length === 0 && <option value="">未找到 Agent</option>}
            {openclawAgents.map((agent) => (
              <option key={agent.name} value={agent.name}>
                {agent.name} ({agent.count} 个会话)
              </option>
            ))}
          </select>
        </div>
      )}

      {sourceType === 'claude-code' && (
        <div className="selector-section">
          <label>Project:</label>
          <select
            value={selectedProject || ''}
            onChange={(e) => setSelectedProject(e.target.value)}
            disabled={claudeProjects.length === 0}
          >
            {claudeProjects.length === 0 && <option value="">未找到 Project</option>}
            {claudeProjects.map((project) => (
              <option key={project.name} value={project.name}>
                {getDisplayName(project.name, projectPrefix)} ({project.count} 个会话)
              </option>
            ))}
          </select>
        </div>
      )}

      {sourceType === 'custom' && (
        <div className="folder-input">
          <input
            type="text"
            value={customPath}
            onChange={(e) => setCustomPath(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && onScanCustom()}
            placeholder="输入文件路径或目录"
          />
          <button onClick={onScanCustom}>扫描</button>
        </div>
      )}

      {/* 错误提示 */}
      {error && <div className="error-msg">{error}</div>}

      {/* 加载状态 */}
      {loading && <div className="loading">加载中...</div>}

      {/* 文件列表 */}
      {!loading && files.length > 0 && (
        <div className="file-list">
          <div className="file-count">共 {files.length} 个会话</div>
          <ul>
            {files.map((file) => (
              <li
                key={file.path}
                className={cn('file-item', selectedFile === file.name && 'selected')}
                onClick={() => onFileSelect(file)}
              >
                {file.name}
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* 空状态 */}
      {!loading && !error && files.length === 0 && sourceType !== 'custom' && (
        <div className="empty-state-small">暂无会话</div>
      )}
    </aside>
  );
}
