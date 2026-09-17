import type { ButtonHTMLAttributes, HTMLAttributes, InputHTMLAttributes, SelectHTMLAttributes } from "react"
import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"

export function cn(...inputs: ClassValue[]): string {
  return twMerge(clsx(inputs))
}

export type ButtonVariant = "pill" | "rect"

export function buttonClass(variant: ButtonVariant = "pill", active = false, className?: string): string {
  return cn(
    "min-h-11 border text-sm font-semibold transition-transform active:scale-[0.96]",
    variant === "pill" ? "rounded-full px-4 py-2" : "tabular-nums rounded-lg px-3 py-1.5",
    active ? "border-ink bg-ink text-white" : "border-hairline bg-paper text-ink",
    className,
  )
}

export type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: ButtonVariant
  active?: boolean
}

export function Button({ variant = "pill", active = false, className, type = "button", ...rest }: ButtonProps) {
  return <button type={type} className={buttonClass(variant, active, className)} {...rest} />
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
  return cn("rounded-lg border border-input bg-paper px-3 py-1.5 text-sm", className)
}

export type InputProps = InputHTMLAttributes<HTMLInputElement>

export function Input({ className, ...rest }: InputProps) {
  return <input className={inputClass(className)} {...rest} />
}

export function selectClass(className?: string): string {
  return cn("min-h-11 rounded-lg border border-input bg-paper px-3 py-1.5 text-sm font-semibold", className)
}

export type SelectProps = SelectHTMLAttributes<HTMLSelectElement>

export function Select({ className, ...rest }: SelectProps) {
  return <select className={selectClass(className)} {...rest} />
}
