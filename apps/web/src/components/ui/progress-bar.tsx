interface ProgressBarProps {
  value: number; // 0–100
  className?: string;
  size?: 'sm' | 'md';
}

export function ProgressBar({ value, className = '', size = 'md' }: ProgressBarProps) {
  const clamped = Math.min(100, Math.max(0, value));
  const heights = { sm: 'h-1.5', md: 'h-2.5' };

  return (
    <div className={`w-full bg-muted rounded-full overflow-hidden ${heights[size]} ${className}`}>
      <div
        className="h-full bg-primary rounded-full transition-all duration-500 ease-out"
        style={{ width: `${clamped}%` }}
      />
    </div>
  );
}
