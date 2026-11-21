import Link from "next/link";
import type { ButtonHTMLAttributes, ComponentProps } from "react";
import { cn } from "@/lib/utils/cn";

export type ButtonVariant = "primary" | "secondary" | "ghost" | "accent" | "danger";
export type ButtonSize = "sm" | "md" | "lg";

const base =
  "inline-flex items-center justify-center gap-2 rounded-xl font-medium transition-colors select-none " +
  "disabled:opacity-50 disabled:pointer-events-none";
const variants: Record<ButtonVariant, string> = {
  primary: "bg-navy-800 text-white hover:bg-navy-700 active:bg-navy-900",
  secondary: "bg-white text-navy-800 border border-gray-200 hover:bg-gray-50 active:bg-gray-100",
  ghost: "text-navy-800 hover:bg-gray-100 active:bg-gray-200",
  accent: "bg-teal-600 text-white hover:bg-teal-600/90",
  danger: "bg-white text-red-700 border border-red-200 hover:bg-red-50",
};
// 44px minimum touch target on md, comfortable on touch screens
const sizes: Record<ButtonSize, string> = {
  sm: "min-h-9 px-3 text-sm",
  md: "min-h-11 px-4 text-[15px]",
  lg: "min-h-12 px-5 text-base",
};

export function buttonStyles(variant: ButtonVariant = "primary", size: ButtonSize = "md", className?: string) {
  return cn(base, variants[variant], sizes[size], className);
}

interface Props extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: ButtonSize;
}

export function Button({ variant, size, className, type = "button", ...rest }: Props) {
  return <button type={type} className={buttonStyles(variant, size, className)} {...rest} />;
}

export function ButtonLink({
  variant,
  size,
  className,
  ...rest
}: ComponentProps<typeof Link> & { variant?: ButtonVariant; size?: ButtonSize }) {
  return <Link className={buttonStyles(variant, size, className)} {...rest} />;
}

/** Square icon-only button; always carries an accessible label. */
export function IconButton({
  label,
  active,
  className,
  children,
  ...rest
}: ButtonHTMLAttributes<HTMLButtonElement> & { label: string; active?: boolean }) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      aria-pressed={active}
      className={cn(
        "grid size-11 place-items-center rounded-xl border transition-colors disabled:opacity-50",
        active
          ? "border-teal-600 bg-teal-100 text-teal-600"
          : "border-gray-200 bg-white text-navy-800 hover:bg-gray-50 active:bg-gray-100",
        className,
      )}
      {...rest}
    >
      {children}
    </button>
  );
}
