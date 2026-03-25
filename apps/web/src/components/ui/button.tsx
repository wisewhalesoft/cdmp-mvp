import { type ButtonHTMLAttributes, forwardRef } from 'react';

const variantClasses = {
  primary: 'bg-primary text-white hover:bg-primary-700',
  secondary: 'bg-white border border-border text-gray-700 hover:bg-gray-50',
  danger: 'bg-danger text-white hover:bg-danger-700',
} as const;

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: keyof typeof variantClasses;
  loading?: boolean;
  loadingText?: string;
}

const Button = forwardRef<HTMLButtonElement, ButtonProps>(
  ({ variant = 'primary', loading, loadingText, disabled, children, className = '', ...props }, ref) => {
    const isDisabled = disabled || loading;

    return (
      <button
        ref={ref}
        disabled={isDisabled}
        className={`rounded-lg px-4 py-2 text-sm font-medium transition-colors ${variantClasses[variant]} ${
          isDisabled ? 'opacity-50 cursor-not-allowed' : ''
        } ${className}`}
        {...props}
      >
        {loading ? loadingText ?? children : children}
      </button>
    );
  },
);

Button.displayName = 'Button';

export { Button };
export type { ButtonProps };
