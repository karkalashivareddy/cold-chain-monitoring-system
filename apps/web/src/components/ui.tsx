import {
  createContext,
  useEffect,
  useState,
  type ButtonHTMLAttributes,
  type InputHTMLAttributes,
  type ReactNode,
  type SelectHTMLAttributes,
  type TextareaHTMLAttributes,
} from "react";
import * as DialogPrimitive from "@radix-ui/react-dialog";
import { AlertTriangle, Check, ChevronLeft, ChevronRight, Copy, Loader2, Search, X } from "lucide-react";
import { cn } from "@/lib/cn";
import type { Tone } from "@/lib/format";

/* -------------------------------------------------------------------------- */
/*  Tones                                                                     */
/* -------------------------------------------------------------------------- */

export const toneClass: Record<Tone, string> = {
  neutral: "border-white/10 bg-white/5 text-mist",
  info: "border-cyan/25 bg-cyan/10 text-cyan",
  success: "border-teal/25 bg-teal/10 text-teal",
  warning: "border-amber/30 bg-amber/10 text-amber",
  danger: "border-rose/30 bg-rose/10 text-rose",
  violet: "border-violet/30 bg-violet/10 text-violet",
};

export const toneDot: Record<Tone, string> = {
  neutral: "bg-mist",
  info: "bg-cyan",
  success: "bg-teal",
  warning: "bg-amber",
  danger: "bg-rose",
  violet: "bg-violet",
};

/* -------------------------------------------------------------------------- */
/*  Buttons                                                                   */
/* -------------------------------------------------------------------------- */

type ButtonVariant = "primary" | "secondary" | "ghost" | "danger" | "success" | "outline";

const buttonVariants: Record<ButtonVariant, string> = {
  primary: "fg-button-primary text-abyss",
  secondary: "fg-button-secondary border border-line bg-elevated/70 text-ice hover:border-cyan/50 hover:bg-elevated",
  ghost: "fg-button-quiet text-mist hover:bg-cyan/8 hover:text-ice",
  danger: "fg-button-danger bg-rose text-abyss",
  success: "fg-button-success bg-teal text-abyss",
  outline: "fg-button-outline border border-cyan/40 text-cyan hover:bg-cyan/10",
};

const buttonSizes = {
  sm: "h-8 gap-1.5 px-3 text-xs",
  md: "h-10 gap-2 px-4 text-sm",
  lg: "h-12 gap-2 px-6 text-base",
};

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: keyof typeof buttonSizes;
  loading?: boolean;
  icon?: ReactNode;
}

export function Button({
  variant = "primary",
  size = "md",
  loading = false,
  icon,
  className,
  children,
  disabled,
  type = "button",
  ...props
}: ButtonProps) {
  return (
    <button
      type={type}
      disabled={disabled || loading}
      className={cn(
        "fg-button inline-flex select-none items-center justify-center rounded-xl font-semibold disabled:cursor-not-allowed disabled:opacity-50",
        buttonVariants[variant],
        buttonSizes[size],
        className
      )}
      {...props}
    >
      {loading ? <Loader2 className="size-4 animate-spin" aria-hidden /> : icon}
      {children}
    </button>
  );
}

export function IconButton({
  label,
  className,
  children,
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & { label: string }) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      className={cn(
        "fg-button fg-button-quiet inline-flex size-9 items-center justify-center rounded-lg text-mist hover:bg-cyan/8 hover:text-ice focus-visible:ring-2 focus-visible:ring-cyan/70",
        className
      )}
      {...props}
    >
      {children}
    </button>
  );
}

/* -------------------------------------------------------------------------- */
/*  Forms                                                                     */
/* -------------------------------------------------------------------------- */

const fieldBase =
  "w-full rounded-xl border border-line bg-abyss/60 px-3 py-2 text-sm text-ice placeholder:text-mist/50 transition-colors hover:border-cyan/35 focus:border-teal/70 focus:outline-none focus:ring-2 focus:ring-cyan/20 disabled:opacity-60";

export function Input({ className, ...props }: InputHTMLAttributes<HTMLInputElement>) {
  return <input className={cn(fieldBase, className)} {...props} />;
}

export function Textarea({ className, ...props }: TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return <textarea className={cn(fieldBase, "min-h-24 resize-y", className)} {...props} />;
}

export function Select({ className, children, ...props }: SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <select className={cn(fieldBase, "appearance-none pr-8", className)} {...props}>
      {children}
    </select>
  );
}

export function Field({
  label,
  htmlFor,
  hint,
  error,
  required,
  children,
  className,
}: {
  label: string;
  htmlFor?: string;
  hint?: string;
  error?: string | null;
  required?: boolean;
  children: ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("space-y-1.5", className)}>
      <label htmlFor={htmlFor} className="flex items-center gap-1 text-xs font-medium text-mist">
        {label}
        {required ? <span className="text-rose">*</span> : null}
      </label>
      {children}
      {error ? (
        <p className="flex items-center gap-1 text-xs text-rose" role="alert">
          <AlertTriangle className="size-3" aria-hidden />
          {error}
        </p>
      ) : hint ? (
        <p className="text-xs text-mist/70">{hint}</p>
      ) : null}
    </div>
  );
}

export function Switch({
  checked,
  onChange,
  label,
  id,
}: {
  checked: boolean;
  onChange: (value: boolean) => void;
  label: string;
  id?: string;
}) {
  return (
    <label htmlFor={id} className="flex cursor-pointer items-center gap-2 text-sm text-ice">
      <button
        id={id}
        type="button"
        role="switch"
        aria-checked={checked}
        aria-label={label}
        onClick={() => onChange(!checked)}
        className={cn(
          "relative h-5 w-9 rounded-full border transition-colors",
          checked ? "border-teal/60 bg-teal/25" : "border-line bg-abyss"
        )}
      >
        <span
          className={cn(
            "absolute top-0.5 size-3.5 rounded-full transition-transform",
            checked ? "translate-x-[18px] bg-teal" : "translate-x-0.5 bg-mist"
          )}
        />
      </button>
      {label}
    </label>
  );
}

export function SearchInput({
  value,
  onChange,
  placeholder = "Search…",
  className,
}: {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  className?: string;
}) {
  return (
    <div className={cn("relative", className)}>
      <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-mist/60" aria-hidden />
      <Input
        type="search"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className="pl-9"
        aria-label={placeholder}
      />
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/*  Badges & pills                                                            */
/* -------------------------------------------------------------------------- */

export function Badge({
  tone = "neutral",
  children,
  dot,
  className,
}: {
  tone?: Tone;
  children: ReactNode;
  dot?: boolean;
  className?: string;
}) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 whitespace-nowrap rounded-full border px-2 py-0.5 text-[11px] font-medium",
        toneClass[tone],
        className
      )}
    >
      {dot ? <span className={cn("size-1.5 rounded-full", toneDot[tone])} aria-hidden /> : null}
      {children}
    </span>
  );
}

export function SimulatedBadge({ className }: { className?: string }) {
  return (
    <Badge tone="violet" className={className} dot>
      Simulated
    </Badge>
  );
}

/* -------------------------------------------------------------------------- */
/*  Surfaces                                                                  */
/* -------------------------------------------------------------------------- */

export function Panel({
  className,
  children,
  ...props
}: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div className={cn("panel p-5", className)} {...props}>
      {children}
    </div>
  );
}

export function PanelHeader({
  title,
  description,
  action,
  className,
}: {
  title: ReactNode;
  description?: ReactNode;
  action?: ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("mb-4 flex flex-wrap items-start justify-between gap-3", className)}>
      <div className="min-w-0">
        <h2 className="text-sm font-semibold tracking-tight text-ice">{title}</h2>
        {description ? <p className="mt-0.5 text-xs text-mist">{description}</p> : null}
      </div>
      {action}
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/*  Table                                                                     */
/* -------------------------------------------------------------------------- */

export function TableWrap({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <div className={cn("-mx-5 overflow-x-auto px-5", className)}>
      <table className="w-full min-w-[42rem] border-collapse text-sm">{children}</table>
    </div>
  );
}

export function TH({ children, className, ...props }: React.ThHTMLAttributes<HTMLTableCellElement>) {
  return (
    <th
      scope="col"
      className={cn(
        "border-b border-line/70 px-3 py-2.5 text-left text-[11px] font-semibold uppercase tracking-wider text-mist/80",
        className
      )}
      {...props}
    >
      {children}
    </th>
  );
}

export function TD({ children, className, ...props }: React.TdHTMLAttributes<HTMLTableCellElement>) {
  return (
    <td className={cn("border-b border-line/40 px-3 py-3 align-middle text-ice/90", className)} {...props}>
      {children}
    </td>
  );
}

export function TR({ children, className, ...props }: React.HTMLAttributes<HTMLTableRowElement>) {
  return (
    <tr className={cn("transition-colors hover:bg-cyan/[0.045]", className)} {...props}>
      {children}
    </tr>
  );
}

/* -------------------------------------------------------------------------- */
/*  States                                                                    */
/* -------------------------------------------------------------------------- */

export function EmptyState({
  title,
  description,
  action,
  icon,
  className,
}: {
  title: string;
  description?: string;
  action?: ReactNode;
  icon?: ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("flex flex-col items-center justify-center gap-3 px-6 py-14 text-center", className)}>
      <div className="flex size-11 items-center justify-center rounded-2xl border border-line bg-elevated/60 text-cyan">
        {icon ?? <AlertTriangle className="size-5" aria-hidden />}
      </div>
      <div>
        <p className="text-sm font-semibold text-ice">{title}</p>
        {description ? <p className="mx-auto mt-1 max-w-sm text-xs text-mist">{description}</p> : null}
      </div>
      {action}
    </div>
  );
}

export function ErrorState({ message, onRetry }: { message: string; onRetry?: () => void }) {
  return (
    <Panel className="border-rose/30">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-start gap-3">
          <AlertTriangle className="mt-0.5 size-5 text-rose" aria-hidden />
          <div>
            <p className="text-sm font-semibold text-ice">Unable to load this view</p>
            <p className="mt-0.5 text-xs text-mist">{message}</p>
          </div>
        </div>
        {onRetry ? (
          <Button variant="secondary" size="sm" onClick={onRetry}>
            Try again
          </Button>
        ) : null}
      </div>
    </Panel>
  );
}

export function Skeleton({ className }: { className?: string }) {
  return <div className={cn("animate-pulse rounded-lg bg-white/[0.06]", className)} aria-hidden />;
}

export function PageSkeleton() {
  return (
    <div className="space-y-4" role="status" aria-busy="true" aria-label="Loading">
      <Skeleton className="h-8 w-56" />
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <Skeleton key={i} className="h-28" />
        ))}
      </div>
      <Skeleton className="h-72" />
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/*  Pagination                                                                */
/* -------------------------------------------------------------------------- */

export function Pagination({
  page,
  totalPages,
  total,
  onPage,
  className,
}: {
  page: number;
  totalPages: number;
  total?: number;
  onPage: (page: number) => void;
  className?: string;
}) {
  if (totalPages <= 1) return null;
  return (
    <nav className={cn("flex items-center justify-between gap-3 pt-4 text-xs text-mist", className)} aria-label="Pagination">
      <span>
        Page {page} of {totalPages}
        {typeof total === "number" ? ` · ${total.toLocaleString()} records` : ""}
      </span>
      <div className="flex items-center gap-2">
        <Button variant="secondary" size="sm" onClick={() => onPage(page - 1)} disabled={page <= 1}>
          <ChevronLeft className="size-3.5" aria-hidden />
          Previous
        </Button>
        <Button variant="secondary" size="sm" onClick={() => onPage(page + 1)} disabled={page >= totalPages}>
          Next
          <ChevronRight className="size-3.5" aria-hidden />
        </Button>
      </div>
    </nav>
  );
}

/* -------------------------------------------------------------------------- */
/*  Progress                                                                  */
/* -------------------------------------------------------------------------- */

export function ProgressBar({
  value,
  tone = "info",
  label,
  className,
}: {
  value: number;
  tone?: Tone;
  label?: string;
  className?: string;
}) {
  const clamped = Math.max(0, Math.min(100, value));
  return (
    <div
      className={cn("h-1.5 w-full overflow-hidden rounded-full bg-white/[0.07]", className)}
      role="progressbar"
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={Math.round(clamped)}
      aria-label={label ?? "Progress"}
    >
      <div className={cn("h-full rounded-full bg-current transition-[width] duration-500", toneDot[tone].replace("bg-", "text-"))} style={{ width: `${clamped}%` }} />
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/*  Modal                                                                     */
/* -------------------------------------------------------------------------- */

export function Modal({
  open,
  onOpenChange,
  title,
  description,
  children,
  footer,
  size = "md",
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description?: string;
  children: ReactNode;
  footer?: ReactNode;
  size?: "sm" | "md" | "lg";
}) {
  const width = size === "sm" ? "max-w-md" : size === "lg" ? "max-w-3xl" : "max-w-xl";
  return (
    <DialogPrimitive.Root open={open} onOpenChange={onOpenChange}>
      <DialogPrimitive.Portal>
        <DialogPrimitive.Overlay className="fixed inset-0 z-50 bg-abyss/80 backdrop-blur-sm data-[state=open]:animate-in" />
        <DialogPrimitive.Content
          className={cn(
            "panel fixed left-1/2 top-1/2 z-50 max-h-[88vh] w-[calc(100vw-2rem)] -translate-x-1/2 -translate-y-1/2 overflow-y-auto p-6 focus:outline-none",
            width
          )}
        >
          <div className="mb-4 flex items-start justify-between gap-4">
            <div>
              <DialogPrimitive.Title className="text-base font-semibold text-ice">{title}</DialogPrimitive.Title>
              {description ? (
                <DialogPrimitive.Description className="mt-1 text-xs text-mist">{description}</DialogPrimitive.Description>
              ) : (
                <DialogPrimitive.Description className="sr-only">{title}</DialogPrimitive.Description>
              )}
            </div>
            <DialogPrimitive.Close asChild>
              <IconButton label="Close dialog">
                <X className="size-4" aria-hidden />
              </IconButton>
            </DialogPrimitive.Close>
          </div>
          {children}
          {footer ? <div className="mt-6 flex justify-end gap-2">{footer}</div> : null}
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  );
}

export function ConfirmDialog({
  open,
  onOpenChange,
  title,
  description,
  confirmLabel = "Confirm",
  tone = "danger",
  loading,
  onConfirm,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description: string;
  confirmLabel?: string;
  tone?: "danger" | "primary";
  loading?: boolean;
  onConfirm: () => void;
}) {
  return (
    <Modal
      open={open}
      onOpenChange={onOpenChange}
      title={title}
      description={description}
      size="sm"
      footer={
        <>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button variant={tone} loading={loading} onClick={onConfirm}>
            {confirmLabel}
          </Button>
        </>
      }
    >
      <div className="rounded-xl border border-line bg-abyss/40 p-3 text-xs text-mist">
        This action is audited. Your name, IP address and the request identifier are recorded.
      </div>
    </Modal>
  );
}

/* -------------------------------------------------------------------------- */
/*  Tabs                                                                      */
/* -------------------------------------------------------------------------- */

export function Tabs({
  tabs,
  value,
  onChange,
  className,
}: {
  tabs: Array<{ value: string; label: string; count?: number }>;
  value: string;
  onChange: (value: string) => void;
  className?: string;
}) {
  return (
    <div className={cn("flex flex-wrap gap-1 rounded-xl border border-line bg-abyss/50 p-1", className)} role="tablist">
      {tabs.map((tab) => (
        <button
          key={tab.value}
          type="button"
          role="tab"
          aria-selected={value === tab.value}
          onClick={() => onChange(tab.value)}
          className={cn(
            "fg-tab rounded-lg px-3 py-1.5 text-xs font-medium transition-colors",
            value === tab.value ? "bg-cyan/15 text-cyan" : "text-mist hover:bg-cyan/8 hover:text-ice"
          )}
        >
          {tab.label}
          {typeof tab.count === "number" ? <span className="ml-1.5 text-[10px]">{tab.count}</span> : null}
        </button>
      ))}
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/*  Misc                                                                      */
/* -------------------------------------------------------------------------- */

export function Avatar({ name, className }: { name: string; className?: string }) {
  const parts = name.trim().split(/\s+/);
  const initials = (parts[0]?.[0] ?? "?") + (parts.length > 1 ? parts[parts.length - 1][0] : "");
  return (
    <span
      className={cn(
        "inline-flex size-8 shrink-0 items-center justify-center rounded-full border border-cyan/25 bg-cyan/10 text-[11px] font-semibold uppercase text-cyan",
        className
      )}
      aria-hidden
    >
      {initials}
    </span>
  );
}

export function CopyButton({ value, label = "Copy" }: { value: string; label?: string }) {
  const [copied, setCopied] = useState(false);
  useEffect(() => {
    if (!copied) return;
    const timer = window.setTimeout(() => setCopied(false), 1500);
    return () => window.clearTimeout(timer);
  }, [copied]);

  return (
    <Button
      variant="ghost"
      size="sm"
      icon={copied ? <Check className="size-3.5" aria-hidden /> : <Copy className="size-3.5" aria-hidden />}
      onClick={() => {
        void navigator.clipboard.writeText(value).then(() => setCopied(true));
      }}
    >
      {copied ? "Copied" : label}
    </Button>
  );
}

/* -------------------------------------------------------------------------- */
/*  Page header + toolbar                                                     */
/* -------------------------------------------------------------------------- */

export function PageHeader({
  eyebrow,
  title,
  description,
  actions,
  className,
}: {
  eyebrow?: string;
  title: string;
  description?: string;
  actions?: ReactNode;
  className?: string;
}) {
  return (
    <header className={cn("flex flex-wrap items-end justify-between gap-4", className)}>
      <div className="min-w-0">
        {eyebrow ? <p className="eyebrow mb-2">{eyebrow}</p> : null}
        <h1 className="text-2xl font-semibold tracking-tight text-ice sm:text-[1.7rem]">{title}</h1>
        {description ? <p className="mt-1 max-w-2xl text-sm text-mist">{description}</p> : null}
      </div>
      {actions ? <div className="flex flex-wrap items-center gap-2">{actions}</div> : null}
    </header>
  );
}

export function FilterBar({ children, className }: { children: ReactNode; className?: string }) {
  return <div className={cn("flex flex-wrap items-end gap-3", className)}>{children}</div>;
}

export function Kpi({
  label,
  value,
  hint,
  tone = "neutral",
  icon,
  className,
}: {
  label: string;
  value: ReactNode;
  hint?: ReactNode;
  tone?: Tone;
  icon?: ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("panel panel-interactive p-4", className)}>
      <div className="flex items-start justify-between gap-3">
        <p className="text-[11px] font-medium uppercase tracking-wider text-mist/80">{label}</p>
        {icon ? <span className={cn("rounded-lg border p-1.5", toneClass[tone])}>{icon}</span> : null}
      </div>
      <p className="stat-value mt-2 text-2xl font-semibold text-ice">{value}</p>
      {hint ? <p className="mt-1 text-[11px] text-mist">{hint}</p> : null}
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/*  Toggle group (used by filters)                                            */
/* -------------------------------------------------------------------------- */

const ToggleCtx = createContext<((value: string) => void) | null>(null);

export function SegmentedControl({
  options,
  value,
  onChange,
  label,
}: {
  options: Array<{ value: string; label: string }>;
  value: string;
  onChange: (value: string) => void;
  label: string;
}) {
  return (
    <div className="inline-flex rounded-xl border border-line bg-abyss/50 p-1" role="group" aria-label={label}>
      <ToggleCtx.Provider value={onChange}>
        {options.map((option) => (
          <button
            key={option.value}
            type="button"
            aria-pressed={option.value === value}
            onClick={() => onChange(option.value)}
            className={cn(
              "rounded-lg px-2.5 py-1 text-xs font-medium transition-colors",
              option.value === value ? "bg-cyan/15 text-cyan" : "text-mist hover:text-ice"
            )}
          >
            {option.label}
          </button>
        ))}
      </ToggleCtx.Provider>
    </div>
  );
}
