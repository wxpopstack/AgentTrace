import { useEffect, useState } from 'react';

interface ToastProps {
  message: string;
  type?: 'error' | 'warning' | 'info';
  duration?: number;
  onClose: () => void;
  onClick?: () => void;
}

export function Toast({
  message,
  type = 'warning',
  duration = 3000,
  onClose,
  onClick,
}: ToastProps) {
  const [visible, setVisible] = useState(true);

  useEffect(() => {
    const timer = setTimeout(() => {
      setVisible(false);
      setTimeout(onClose, 300); // 等动画完成
    }, duration);

    return () => clearTimeout(timer);
  }, [duration, onClose]);

  const typeStyles = {
    error: 'toast-error',
    warning: 'toast-warning',
    info: 'toast-info',
  };

  const handleClick = () => {
    if (onClick) {
      onClick();
      setVisible(false);
      setTimeout(onClose, 300);
    }
  };

  return (
    <div
      className={`toast ${typeStyles[type]} ${visible ? 'toast-visible' : 'toast-hidden'} ${onClick ? 'toast-clickable' : ''}`}
      onClick={handleClick}
    >
      {message}
      {onClick && <span className="toast-action">点击查看</span>}
    </div>
  );
}
