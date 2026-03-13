import { type InputHTMLAttributes, forwardRef, useId } from 'react';

interface InputProps extends InputHTMLAttributes<HTMLInputElement> {
  label?: string;
  error?: string;
}

const Input = forwardRef<HTMLInputElement, InputProps>(
  ({ label, error, className = '', id: externalId, ...props }, ref) => {
    const generatedId = useId();
    const id = externalId ?? generatedId;

    return (
      <div className="w-full">
        {label && (
          <label htmlFor={id} className="block text-sm font-medium text-gray-700 mb-1">
            {label}
          </label>
        )}
        <input
          ref={ref}
          id={id}
          className={`w-full border rounded-md px-3 py-2 focus:outline-none focus:ring-2 focus:ring-primary ${
            error ? 'border-danger-600' : 'border-border'
          } ${className}`}
          {...props}
        />
        {error && <p className="mt-1 text-sm text-danger-600">{error}</p>}
      </div>
    );
  },
);

Input.displayName = 'Input';

export { Input };
export type { InputProps };
