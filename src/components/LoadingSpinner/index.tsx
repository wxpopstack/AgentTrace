import './LoadingSpinner.css';

interface LoadingSpinnerProps {
  size?: 'small' | 'medium' | 'large';
  text?: string;
}

export function LoadingSpinner({ size = 'medium', text }: LoadingSpinnerProps) {
  return (
    <div className={`loading-spinner loading-spinner--${size}`}>
      <div className="spinner-ring">
        <div className="spinner-segment spinner-segment--1"></div>
        <div className="spinner-segment spinner-segment--2"></div>
        <div className="spinner-segment spinner-segment--3"></div>
        <div className="spinner-segment spinner-segment--4"></div>
      </div>
      <div className="spinner-inner-ring"></div>
      <div className="spinner-dot"></div>
      {text && <div className="spinner-text">{text}</div>}
    </div>
  );
}
