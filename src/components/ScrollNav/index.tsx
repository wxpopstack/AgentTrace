import { useState, useEffect } from 'react';

interface ScrollNavProps {
  containerRef: React.RefObject<HTMLDivElement | null>;
}

export function ScrollNav({ containerRef }: ScrollNavProps) {
  const [atTop, setAtTop] = useState(true);
  const [atBottom, setAtBottom] = useState(false);
  const scrollThreshold = 100;

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const handleScroll = () => {
      const { scrollTop, scrollHeight, clientHeight } = container;
      setAtTop(scrollTop < scrollThreshold);
      setAtBottom(scrollHeight - scrollTop - clientHeight < scrollThreshold);
    };

    container.addEventListener('scroll', handleScroll);
    handleScroll();

    // 监听内容变化（消息加载后重新检查）
    const resizeObserver = new ResizeObserver(handleScroll);
    resizeObserver.observe(container);
    return () => {
      container.removeEventListener('scroll', handleScroll);
      resizeObserver.disconnect();
    };
  }, [containerRef]);

  const scrollToTop = () => {
    if (!atTop) {
      containerRef.current?.scrollTo({ top: 0, behavior: 'smooth' });
    }
  };

  const scrollToBottom = () => {
    if (!atBottom) {
      const container = containerRef.current;
      if (container) {
        container.scrollTo({ top: container.scrollHeight, behavior: 'smooth' });
      }
    }
  };

  return (
    <div className="scroll-nav">
      <button
        className={`scroll-nav-btn ${atTop ? 'disabled' : ''}`}
        onClick={scrollToTop}
        disabled={atTop}
        title="回顶部"
      >
        ⬆️
      </button>
      <button
        className={`scroll-nav-btn ${atBottom ? 'disabled' : ''}`}
        onClick={scrollToBottom}
        disabled={atBottom}
        title="到底部"
      >
        ⬇️
      </button>
    </div>
  );
}
