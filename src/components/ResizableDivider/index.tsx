import { useRef, useEffect } from 'react';

interface ResizableDividerProps {
  onResize: (width: number) => void;
  initialWidth: number;
  minWidth?: number;
  maxWidth?: number;
}

export function ResizableDivider({
  onResize,
  initialWidth,
  minWidth = 200,
  maxWidth = 500,
}: ResizableDividerProps) {
  const dividerRef = useRef<HTMLDivElement>(null);
  const isDraggingRef = useRef(false);
  const sidebarRef = useRef<HTMLElement | null>(null);
  const mainRef = useRef<HTMLElement | null>(null);

  useEffect(() => {
    // 找到 sidebar 和 main-content 元素
    sidebarRef.current = document.querySelector('.sidebar');
    mainRef.current = document.querySelector('.main-content');
  }, []);

  const handleMouseDown = (e: React.MouseEvent) => {
    e.preventDefault();
    isDraggingRef.current = true;
    dividerRef.current?.classList.add('dragging');
    document.body.style.cursor = 'col-resize';
    document.body.style.userSelect = 'none';
  };

  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      if (!isDraggingRef.current) return;

      const newWidth = Math.min(Math.max(e.clientX, minWidth), maxWidth);

      // 直接操作 DOM，不触发 React 渲染
      if (sidebarRef.current) {
        sidebarRef.current.style.width = `${newWidth}px`;
      }
      if (dividerRef.current) {
        dividerRef.current.style.left = `${newWidth}px`;
      }
      if (mainRef.current) {
        mainRef.current.style.marginLeft = `${newWidth}px`;
      }
    };

    const handleMouseUp = () => {
      if (!isDraggingRef.current) return;
      isDraggingRef.current = false;
      dividerRef.current?.classList.remove('dragging');
      document.body.style.cursor = '';
      document.body.style.userSelect = '';

      // 只在结束时通知父组件更新 state
      if (sidebarRef.current) {
        const finalWidth = parseInt(sidebarRef.current.style.width, 10);
        onResize(finalWidth);
      }
    };

    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mouseup', handleMouseUp);

    return () => {
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
    };
  }, [minWidth, maxWidth, onResize]);

  return (
    <div
      ref={dividerRef}
      className="resizable-divider"
      onMouseDown={handleMouseDown}
      style={{ left: initialWidth }}
    />
  );
}
