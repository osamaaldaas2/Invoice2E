'use client';

import {
  createContext,
  forwardRef,
  type HTMLAttributes,
  type ButtonHTMLAttributes,
  type ReactNode,
  useCallback,
  useContext,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
} from 'react';
import { createPortal } from 'react-dom';
import { cn } from '@/lib/utils';

type DialogContextValue = {
  open: boolean;
  setOpen: (next: boolean) => void;
};

const DialogContext = createContext<DialogContextValue | null>(null);

type DialogContentContextValue = {
  titleId: string;
  descriptionId: string;
};

const DialogContentContext = createContext<DialogContentContextValue | null>(null);

function useDialogContext(component: string): DialogContextValue {
  const ctx = useContext(DialogContext);
  if (!ctx) {
    throw new Error(`${component} must be used inside Dialog`);
  }
  return ctx;
}

type DialogProps = {
  children: ReactNode;
  open?: boolean;
  defaultOpen?: boolean;
  onOpenChange?: (open: boolean) => void;
};

export function Dialog({ children, open, defaultOpen = false, onOpenChange }: DialogProps) {
  const [uncontrolledOpen, setUncontrolledOpen] = useState(defaultOpen);
  const isControlled = open !== undefined;
  const isOpen = isControlled ? open : uncontrolledOpen;

  const setOpen = useCallback(
    (next: boolean) => {
      if (!isControlled) {
        setUncontrolledOpen(next);
      }
      onOpenChange?.(next);
    },
    [isControlled, onOpenChange]
  );

  const value = useMemo(() => ({ open: isOpen, setOpen }), [isOpen, setOpen]);

  return <DialogContext.Provider value={value}>{children}</DialogContext.Provider>;
}

type DialogTriggerProps = ButtonHTMLAttributes<HTMLButtonElement>;

export const DialogTrigger = forwardRef<HTMLButtonElement, DialogTriggerProps>(
  ({ children, onClick, ...props }, ref) => {
    const { open, setOpen } = useDialogContext('DialogTrigger');
    return (
      <button
        type="button"
        ref={ref}
        onClick={(event) => {
          onClick?.(event);
          if (!event.defaultPrevented) {
            setOpen(!open);
          }
        }}
        {...props}
      >
        {children}
      </button>
    );
  }
);
DialogTrigger.displayName = 'DialogTrigger';

type DialogContentProps = HTMLAttributes<HTMLDivElement> & {
  overlayClassName?: string;
};

export const DialogContent = forwardRef<HTMLDivElement, DialogContentProps>(
  ({ className, children, onClick, overlayClassName, ...props }, ref) => {
    const { open, setOpen } = useDialogContext('DialogContent');
    const [mounted, setMounted] = useState(false);
    const contentRef = useRef<HTMLDivElement | null>(null);
    const previousFocusRef = useRef<HTMLElement | null>(null);
    const contentId = useId();
    const ids = useMemo(
      () => ({
        titleId: `dialog-title-${contentId}`,
        descriptionId: `dialog-description-${contentId}`,
      }),
      [contentId]
    );

    // eslint-disable-next-line -- standard client-mount hydration pattern
    useEffect(() => {
      setMounted(true);
    }, []);

    useEffect(() => {
      if (!open) return;
      previousFocusRef.current = document.activeElement as HTMLElement | null;
      document.body.style.overflow = 'hidden';
      const frame = requestAnimationFrame(() => {
        contentRef.current?.focus();
      });
      return () => {
        cancelAnimationFrame(frame);
        document.body.style.overflow = '';
        previousFocusRef.current?.focus();
      };
    }, [open]);

    // Focus trap + Escape handler (UX-2 fix)
    useEffect(() => {
      if (!open) return;
      const handleKeyDown = (event: KeyboardEvent) => {
        if (event.key === 'Escape') {
          event.preventDefault();
          setOpen(false);
          return;
        }

        if (event.key === 'Tab') {
          const node = contentRef.current;
          if (!node) return;
          const focusable = node.querySelectorAll<HTMLElement>(
            'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'
          );
          if (focusable.length === 0) return;
          const first = focusable[0]!;
          const last = focusable[focusable.length - 1]!;
          if (event.shiftKey) {
            if (document.activeElement === first) {
              event.preventDefault();
              last.focus();
            }
          } else {
            if (document.activeElement === last) {
              event.preventDefault();
              first.focus();
            }
          }
        }
      };
      window.addEventListener('keydown', handleKeyDown);
      return () => window.removeEventListener('keydown', handleKeyDown);
    }, [open, setOpen]);

    if (!mounted || !open) return null;

    return createPortal(
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
        <div
          className={cn('absolute inset-0 bg-black/70 backdrop-blur-sm', overlayClassName)}
          onClick={() => setOpen(false)}
          aria-hidden="true"
        />
        <DialogContentContext.Provider value={ids}>
          <div
            ref={(node) => {
              contentRef.current = node;
              if (typeof ref === 'function') {
                ref(node);
              } else if (ref) {
                ref.current = node;
              }
            }}
            role="dialog"
            aria-modal="true"
            aria-labelledby={ids.titleId}
            aria-describedby={ids.descriptionId}
            tabIndex={-1}
            className={cn(
              'relative z-10 w-full max-w-[calc(100vw-2rem)] sm:max-w-lg rounded-2xl border border-white/15 bg-slate-950/95 p-4 sm:p-6 text-slate-100 shadow-[0_20px_60px_rgba(0,0,0,0.45)]',
              className
            )}
            onClick={(event) => {
              event.stopPropagation();
              onClick?.(event);
            }}
            {...props}
          >
            {children}
          </div>
        </DialogContentContext.Provider>
      </div>,
      document.body
    );
  }
);
DialogContent.displayName = 'DialogContent';

type DialogCloseProps = ButtonHTMLAttributes<HTMLButtonElement>;

export const DialogClose = forwardRef<HTMLButtonElement, DialogCloseProps>(
  ({ children, onClick, ...props }, ref) => {
    const { setOpen } = useDialogContext('DialogClose');
    return (
      <button
        type="button"
        ref={ref}
        onClick={(event) => {
          onClick?.(event);
          if (!event.defaultPrevented) {
            setOpen(false);
          }
        }}
        {...props}
      >
        {children}
      </button>
    );
  }
);
DialogClose.displayName = 'DialogClose';

type DialogHeaderProps = HTMLAttributes<HTMLDivElement>;

export function DialogHeader({ className, ...props }: DialogHeaderProps) {
  return <div className={cn('mb-4 space-y-2', className)} {...props} />;
}

type DialogTitleProps = HTMLAttributes<HTMLHeadingElement>;

export function DialogTitle({ className, ...props }: DialogTitleProps) {
  const ids = useContext(DialogContentContext);
  return (
    <h2
      id={ids?.titleId}
      className={cn('text-xl font-semibold text-white', className)}
      {...props}
    />
  );
}

type DialogDescriptionProps = HTMLAttributes<HTMLParagraphElement>;

export function DialogDescription({ className, ...props }: DialogDescriptionProps) {
  const ids = useContext(DialogContentContext);
  return (
    <p id={ids?.descriptionId} className={cn('text-sm text-slate-300', className)} {...props} />
  );
}
