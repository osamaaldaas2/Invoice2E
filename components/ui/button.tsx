import { forwardRef, type ButtonHTMLAttributes } from 'react';
import { cn } from '@/lib/utils';

export type ButtonVariant = 'default' | 'destructive' | 'outline' | 'secondary' | 'ghost' | 'link';
export type ButtonSize = 'default' | 'sm' | 'lg' | 'icon';

type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
    variant?: ButtonVariant;
    size?: ButtonSize;
};

const variantStyles: Record<ButtonVariant, string> = {
    default: 'bg-gradient-to-r from-sky-400 via-blue-500 to-indigo-500 text-white shadow-[0_12px_30px_-18px_rgba(56,189,248,0.8)] hover:brightness-110',
    destructive: 'bg-gradient-to-r from-red-500 to-rose-500 text-white shadow-[0_12px_28px_-18px_rgba(244,63,94,0.6)] hover:brightness-110',
    outline: 'border border-white/15 bg-white/5 text-slate-100 hover:bg-white/10',
    secondary: 'bg-slate-900/70 text-slate-100 border border-white/10 hover:bg-slate-800/70',
    ghost: 'text-slate-200 hover:bg-white/10',
    link: 'text-sky-300 underline-offset-4 hover:text-sky-100 hover:underline',
};

const sizeStyles: Record<ButtonSize, string> = {
    default: 'h-10 px-4 py-2',
    sm: 'h-9 rounded-md px-3',
    lg: 'h-11 rounded-md px-8',
    icon: 'h-10 w-10',
};

const Button = forwardRef<HTMLButtonElement, ButtonProps>(
    ({ className, variant = 'default', size = 'default', ...props }, ref) => {
        return (
            <button
                className={cn(
                    'inline-flex items-center justify-center whitespace-nowrap rounded-full text-sm font-semibold ring-offset-background transition-all duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50',
                    variantStyles[variant],
                    sizeStyles[size],
                    className
                )}
                ref={ref}
                {...props}
            />
        );
    }
);
Button.displayName = 'Button';

export { Button };
