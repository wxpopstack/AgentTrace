import { useState, useCallback, useEffect } from 'react';
import { invoke } from '@tauri-apps/api/core';
import type { FileInfo, DiscoveredItem, SourceType } from '../types/message';

export function useSourceSelector() {
  // 来源类型
  const [sourceType, setSourceType] = useState<SourceType>('openclaw');

  // 发现的 agents/projects 列表
  const [openclawAgents, setOpenclawAgents] = useState<DiscoveredItem[]>([]);
  const [claudeProjects, setClaudeProjects] = useState<DiscoveredItem[]>([]);

  // 当前选择
  const [selectedAgent, setSelectedAgent] = useState<string | null>(null);
  const [selectedProject, setSelectedProject] = useState<string | null>(null);
  const [customPath, setCustomPath] = useState<string>('');

  // 文件列表
  const [files, setFiles] = useState<FileInfo[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // 初始化时发现来源
  useEffect(() => {
    async function discoverSources() {
      try {
        const [agents, projects] = await Promise.all([
          invoke<DiscoveredItem[]>('discover_openclaw_agents'),
          invoke<DiscoveredItem[]>('discover_claude_projects'),
        ]);
        setOpenclawAgents(agents);
        setClaudeProjects(projects);

        // 自动选择第一个
        if (agents.length > 0) {
          setSelectedAgent(agents[0].name);
        }
        if (projects.length > 0) {
          setSelectedProject(projects[0].name);
        }
      } catch (e) {
        console.error('Failed to discover sources:', e);
      }
    }
    discoverSources();
  }, []);

  // 构建当前路径
  const getCurrentPath = useCallback(() => {
    switch (sourceType) {
      case 'openclaw': {
        if (!selectedAgent) return null;
        return `~/.openclaw/agents/${selectedAgent}/sessions`;
      }
      case 'claude-code': {
        if (!selectedProject) return null;
        return `~/.claude/projects/${selectedProject}`;
      }
      case 'custom': {
        return customPath || null;
      }
    }
  }, [sourceType, selectedAgent, selectedProject, customPath]);

  // 扫描文件
  const scanFiles = useCallback(async () => {
    const path = getCurrentPath();
    if (!path) {
      setFiles([]);
      return;
    }

    setLoading(true);
    setError(null);
    try {
      const result = await invoke<FileInfo[]>('scan_directory', { folderPath: path });
      setFiles(result);
    } catch (e) {
      setError(String(e));
      setFiles([]);
    } finally {
      setLoading(false);
    }
  }, [getCurrentPath]);

  // 当路径变化时自动扫描
  useEffect(() => {
    if (sourceType !== 'custom') {
      scanFiles();
    }
  }, [sourceType, selectedAgent, selectedProject, scanFiles]);

  // 切换来源类型
  const handleSetSourceType = useCallback((type: SourceType) => {
    setSourceType(type);
    setError(null);
    // 自定义模式不自动扫描
    if (type === 'custom') {
      setFiles([]);
    }
  }, []);

  return {
    // 来源状态
    sourceType,
    setSourceType: handleSetSourceType,
    openclawAgents,
    claudeProjects,
    selectedAgent,
    setSelectedAgent,
    selectedProject,
    setSelectedProject,
    customPath,
    setCustomPath,

    // 文件状态
    files,
    loading,
    error,
    scanFiles,
  };
}
