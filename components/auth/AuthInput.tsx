"use client";

import { useState } from "react";
import { Eye, EyeOff, type LucideIcon } from "lucide-react";

/** Labelled input with a leading icon; password inputs get a show/hide toggle. */
export default function AuthInput({
  id,
  name,
  label,
  icon: Icon,
  type = "text",
  placeholder,
  autoComplete,
  autoFocus,
  required = true,
}: {
  id: string;
  name: string;
  label: string;
  icon: LucideIcon;
  type?: "text" | "password" | "email";
  placeholder?: string;
  autoComplete?: string;
  autoFocus?: boolean;
  required?: boolean;
}) {
  const [shown, setShown] = useState(false);
  const isPassword = type === "password";

  return (
    <div className="auth-field">
      <label htmlFor={id}>
        {required && <span className="req" aria-hidden="true">*</span>}
        {label}
      </label>
      <div className="input-icon">
        <Icon size={18} />
        <input
          id={id}
          name={name}
          type={isPassword && !shown ? "password" : isPassword ? "text" : type}
          placeholder={placeholder}
          autoComplete={autoComplete}
          autoFocus={autoFocus}
          required={required}
          spellCheck={false}
          autoCapitalize="none"
        />
        {isPassword && (
          <button type="button" className="pw-toggle" onClick={() => setShown((s) => !s)} aria-label={shown ? "Hide password" : "Show password"} aria-pressed={shown}>
            {shown ? <EyeOff size={18} /> : <Eye size={18} />}
          </button>
        )}
      </div>
    </div>
  );
}
