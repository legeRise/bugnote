import { cn } from "../lib/utils";

export function Button({ variant = "default", size = "default", className, ...props }) {
  return <button className={cn("btn", `btn-${variant}`, `btn-${size}`, className)} {...props} />;
}

export function IconButton({ label, className, ...props }) {
  return <button aria-label={label} title={label} className={cn("icon-btn", className)} {...props} />;
}

export function Input(props) {
  return <input className="input" {...props} />;
}

export function Select(props) {
  return <select className="input select" {...props} />;
}

export function Textarea(props) {
  return <textarea className="textarea" {...props} />;
}

export function Field({ label, children, className }) {
  return (
    <label className={cn("field", className)}>
      <span>{label}</span>
      {children}
    </label>
  );
}

export function Badge({ children, className, style }) {
  return <span className={cn("badge", className)} style={style}>{children}</span>;
}

export function Dialog({ open, children }) {
  if (!open) return null;
  return <div className="dialog-backdrop">{children}</div>;
}
