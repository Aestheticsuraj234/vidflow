import type {InputHTMLAttributes} from 'react';

import {cn} from '@/lib/cn';

export function Input({className, ...props}: InputHTMLAttributes<HTMLInputElement>) {
  return (
    <input
      className={cn(
        'h-10 w-full rounded-sm border border-border bg-bg px-3 text-sm text-fg placeholder:text-muted/70 focus:border-accent focus:outline-none aria-invalid:border-danger',
        className,
      )}
      {...props}
    />
  );
}
