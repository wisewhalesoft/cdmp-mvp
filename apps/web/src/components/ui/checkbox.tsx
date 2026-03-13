import { type InputHTMLAttributes, forwardRef, useId } from 'react';

interface CheckboxProps extends Omit<InputHTMLAttributes<HTMLInputElement>, 'type'> {
  label: string;
}

const Checkbox = forwardRef<HTMLInputElement, CheckboxProps>(
  ({ label, className = '', id: externalId, ...props }, ref) => {
    const generatedId = useId();
    const id = externalId ?? generatedId;

    return (
      <div className={`flex items-center gap-2 ${className}`}>
        <input
          ref={ref}
          id={id}
          type="checkbox"
          className="h-4 w-4 rounded border-border text-primary focus:ring-primary"
          {...props}
        />
        <label htmlFor={id} className="text-sm text-gray-600">
          {label}
        </label>
      </div>
    );
  },
);

Checkbox.displayName = 'Checkbox';

export { Checkbox };
export type { CheckboxProps };
