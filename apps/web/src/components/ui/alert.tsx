import type { ReactNode } from 'react';

interface AlertProps {
  variant?: 'error';
  children: ReactNode;
  className?: string;
}

function Alert({ variant = 'error', children, className = '' }: AlertProps) {
  const variantClasses = {
    error: 'bg-danger-50 border-danger text-danger-700',
  };

  return (
    <div
      role="alert"
      className={`border rounded-md px-4 py-3 text-sm ${variantClasses[variant]} ${className}`}
    >
      {children}
    </div>
  );
}

export { Alert };
export type { AlertProps };
