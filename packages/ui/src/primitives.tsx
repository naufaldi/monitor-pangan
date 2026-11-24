import type { ButtonHTMLAttributes, HTMLAttributes, InputHTMLAttributes, Ref, SelectHTMLAttributes } from "react"
import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"

export function cn(...inputs: ClassValue[]): string {
  return twMerge(clsx(inputs))
}

/** Keyboard focus ring shared by every interactive primitive. */
export const focusRing =
  "outline-none focus-visible:outline-solid focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"

export const controlFeedback =
  "cursor-pointer transition-[scale,background-color,border-color,color] duration-140 ease-control active:scale-[0.96] active:duration-90 motion-reduce:transition-none motion-reduce:active:scale-100 disabled:cursor-not-allowed disabled:active:scale-100"

const lightControlSurface = "not-disabled:hover:border-slate/40 not-disabled:hover:bg-muted not-disabled:active:bg-selected"

export type ButtonVariant = "pill" | "rect" | "primary"

export function buttonClass(variant: ButtonVariant = "pill", active = false, className?: string): string {
  return cn(
    "inline-flex min-h-11 items-center justify-center border text-center text-sm font-semibold disabled:opacity-50",
    controlFeedback,
    focusRing,
    variant === "pill" && "rounded-full px-4 py-2",
    variant === "rect" && "tabular-nums rounded-lg px-3 py-1.5",
    variant === "primary" && "rounded-lg px-4 py-2",
    variant === "primary"
      ? "border-leaf-deep bg-leaf-deep text-paper not-disabled:hover:bg-leaf-deep/94 not-disabled:active:bg-leaf-deep/88"
      : active
        ? "border-ink bg-ink text-white not-disabled:hover:bg-ink/90 not-disabled:active:bg-ink/82"
        : cn("border-hairline bg-paper text-ink", lightControlSurface),
    className,
  )
}

export type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: ButtonVariant
  active?: boolean
  ref?: Ref<HTMLButtonElement>
}

export function Button({ variant = "pill", active = false, className, type = "button", ref, ...rest }: ButtonProps) {
  return <button ref={ref} type={type} className={buttonClass(variant, active, className)} {...rest} />
}

export type CardPadding = "none" | "md" | "lg"

export function cardClass(padding: CardPadding = "none", className?: string): string {
  return cn(
    "rounded-xl border border-hairline bg-paper",
    padding === "md" && "p-4",
    padding === "lg" && "p-5",
    className,
  )
}

export type CardProps = HTMLAttributes<HTMLDivElement> & {
  padding?: CardPadding
}

export function Card({ padding = "none", className, ...rest }: CardProps) {
  return <div className={cardClass(padding, className)} {...rest} />
}

export type BadgeTone = "ember" | "neutral"

export function badgeClass(tone: BadgeTone = "ember", className?: string): string {
  return cn(
    "tabular-nums rounded-full px-3 py-1 text-xs font-semibold",
    tone === "ember" ? "bg-ember-soft text-ember" : "bg-muted text-slate",
    className,
  )
}

export type BadgeProps = HTMLAttributes<HTMLSpanElement> & {
  tone?: BadgeTone
}

export function Badge({ tone = "ember", className, ...rest }: BadgeProps) {
  return <span className={badgeClass(tone, className)} {...rest} />
}

export function inputClass(className?: string): string {
  return cn("min-h-11 rounded-lg border border-hairline bg-paper px-3 py-1.5 text-sm aria-invalid:border-ember", focusRing, className)
}

export type InputProps = InputHTMLAttributes<HTMLInputElement> & {
  ref?: Ref<HTMLInputElement>
}

export function Input({ className, ref, ...rest }: InputProps) {
  return <input ref={ref} className={inputClass(className)} {...rest} />
}

export function selectClass(className?: string): string {
  return cn("min-h-11 rounded-lg border border-hairline bg-paper px-3 py-1.5 text-sm font-semibold disabled:opacity-50", controlFeedback, lightControlSurface, "active:scale-[0.99]", focusRing, className)
}

export type SelectProps = SelectHTMLAttributes<HTMLSelectElement> & {
  ref?: Ref<HTMLSelectElement>
}

export function Select({ className, ref, ...rest }: SelectProps) {
  return <select ref={ref} className={selectClass(className)} {...rest} />
}
