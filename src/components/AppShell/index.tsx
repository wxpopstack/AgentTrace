import { Sidebar } from '../Sidebar';
import { ChatMessage } from '../ChatMessage';
import { ResizableDivider } from '../ResizableDivider';
import { Toast } from '../Toast';
import { LoadingSpinner } from '../LoadingSpinner';
import { ScrollNav } from '../ScrollNav';
import { useSourceSelector } from '../../hooks/useSourceSelector';
import { useJsonlParser } from '../../hooks/useJsonlParser';
import { useState, useEffect, useRef } from 'react';

const DEFAULT_SIDEBAR_WIDTH = 320;

export function AppShell() {
  const [sidebarWidth, setSidebarWidth] = useState(DEFAULT_SIDEBAR_WIDTH);
  const [showToast, setShowToast] = useState(false);

  const {
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
    loading: filesLoading,
    error,
    scanFiles,
  } = useSourceSelector();

  const {
    messages,
    failedCount,
    loading: parseLoading,
    error: parseError,
    loadFile,
    clearMessages,
  } = useJsonlParser();
  const [selectedFile, setSelectedFile] = useState<string | null>(null);
  const messageListRef = useRef<HTMLDivElement>(null);

  const handleFileSelect = (file: { name: string; path: string }) => {
    setSelectedFile(file.name);
    clearMessages(); // 先清空之前的消息
    loadFile(file.path, sourceType);
  };

  // 解析失败时显示 toast
  useEffect(() => {
    if (failedCount > 0) {
      setShowToast(true);
    }
  }, [failedCount]);

  // 加载文件后滚动到顶部
  useEffect(() => {
    if (messages.length > 0 && messageListRef.current) {
      messageListRef.current.scrollTop = 0;
    }
  }, [messages]);

  // 切换来源时清空选中文件和消息
  useEffect(() => {
    setSelectedFile(null);
    clearMessages();
  }, [sourceType, selectedAgent, selectedProject, clearMessages]);

  // 点击 Toast 跳转到第一条失败消息
  const scrollToFirstUnknown = () => {
    const firstUnknown = messages.find((msg) => msg.role === 'unknown');
    if (!firstUnknown || !messageListRef.current) return;

    const messageElement = messageListRef.current.querySelector(
      `[data-message-id="${firstUnknown.id}"]`
    );
    if (messageElement) {
      messageElement.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }
  };

  return (
    <div className="app-shell">
      <Sidebar
        width={sidebarWidth}
        sourceType={sourceType}
        setSourceType={setSourceType}
        openclawAgents={openclawAgents}
        claudeProjects={claudeProjects}
        selectedAgent={selectedAgent}
        setSelectedAgent={setSelectedAgent}
        selectedProject={selectedProject}
        setSelectedProject={setSelectedProject}
        customPath={customPath}
        setCustomPath={setCustomPath}
        files={files}
        selectedFile={selectedFile}
        loading={filesLoading}
        error={error}
        onScanCustom={scanFiles}
        onFileSelect={handleFileSelect}
      />

      <ResizableDivider
        initialWidth={sidebarWidth}
        onResize={setSidebarWidth}
        minWidth={200}
        maxWidth={500}
      />

      <main className="main-content" style={{ marginLeft: sidebarWidth }}>
        <header className="main-header">
          <h1>🤖 AI Agent 对话日志查看器</h1>
        </header>

        {!selectedFile && <div className="empty-state">👈 请在左侧选择文件</div>}

        {parseLoading && (
          <div className="loading-overlay">
            <LoadingSpinner size="large" text="正在解析..." />
          </div>
        )}

        {!parseLoading && selectedFile && parseError && (
          <div className="empty-state error">❌ {parseError}</div>
        )}

        {!parseLoading && selectedFile && !parseError && messages.length === 0 && (
          <div className="empty-state">暂无消息</div>
        )}

        <div className="message-list" ref={messageListRef}>
          {messages.map((msg) => (
            <ChatMessage key={msg.id} message={msg} />
          ))}
        </div>

        {selectedFile && messages.length > 0 && <ScrollNav containerRef={messageListRef} />}
      </main>

      {showToast && failedCount > 0 && (
        <Toast
          message={`⚠️ 有 ${failedCount} 行数据解析失败`}
          type="warning"
          onClose={() => setShowToast(false)}
          onClick={scrollToFirstUnknown}
        />
      )}
    </div>
  );
}
