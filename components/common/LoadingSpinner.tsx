import { cn } from '@/lib/utils';

type LoadingSpinnerProps = {
    className?: string;
    size?: 'sm' | 'md' | 'lg';
};

const sizeStyles = {
    sm: 'h-4 w-4 border-2',
    md: 'h-8 w-8 border-2',
    lg: 'h-12 w-12 border-[3px]',
};

export default function LoadingSpinner({
    className,
    size = 'md',
}: LoadingSpinnerProps): React.ReactElement {
    return (
        <div
            className={cn(
                'animate-spin rounded-full border-solid border-sky-400 border-t-transparent',
                sizeStyles[size],
                className
            )}
            role="status"
            aria-label="Loading"
        >
            <span className="sr-only">Loading...</span>
        </div>
    );
}
