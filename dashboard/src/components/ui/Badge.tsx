interface BadgeProps {
  variant: 'success' | 'warning' | 'error' | 'info' | 'neutral' | 'default';
  pulse?: boolean;
  children: React.ReactNode;
}

const variantStyles = {
  success: 'bg-green-100 text-green-800',
  warning: 'bg-yellow-100 text-yellow-800',
  error: 'bg-red-100 text-red-800',
  info: 'bg-blue-100 text-blue-800',
  neutral: 'bg-gray-100 text-gray-800',
  default: 'bg-gray-100 text-gray-600',
};

export function Badge({ variant, pulse = false, children }: BadgeProps) {
  return (
    <span
      className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${variantStyles[variant]} ${
        pulse ? 'animate-pulse-slow' : ''
      }`}
    >
      {children}
    </span>
  );
}
