import { forwardRef, type HTMLAttributes } from 'react';
import { cn } from '@/lib/utils';

type AlertVariant = 'default' | 'destructive';

type AlertProps = HTMLAttributes<HTMLDivElement> & {
    variant?: AlertVariant;
};

const variantStyles: Record<AlertVariant, string> = {
    default: 'glass-panel text-slate-100',
    destructive: 'border border-red-400/40 text-red-200 bg-red-500/10 [&>svg]:text-red-300',
};

const Alert = forwardRef<HTMLDivElement, AlertProps>(
    ({ className, variant = 'default', ...props }, ref) => (
        <div
            ref={ref}
            role="alert"
            className={cn(
                'relative w-full rounded-lg border p-4 [&>svg+div]:translate-y-[-3px] [&>svg]:absolute [&>svg]:left-4 [&>svg]:top-4 [&>svg]:text-foreground [&>svg~*]:pl-7',
                variantStyles[variant],
                className
            )}
            {...props}
        />
    )
);
Alert.displayName = 'Alert';

const AlertTitle = forwardRef<HTMLParagraphElement, HTMLAttributes<HTMLHeadingElement>>(
    ({ className, ...props }, ref) => (
        <h5
            ref={ref}
            className={cn('mb-1 font-medium leading-none tracking-tight', className)}
            {...props}
        />
    )
);
AlertTitle.displayName = 'AlertTitle';

const AlertDescription = forwardRef<HTMLParagraphElement, HTMLAttributes<HTMLParagraphElement>>(
    ({ className, ...props }, ref) => (
        <div
            ref={ref}
            className={cn('text-sm [&_p]:leading-relaxed', className)}
            {...props}
        />
    )
);
AlertDescription.displayName = 'AlertDescription';

export { Alert, AlertTitle, AlertDescription };
