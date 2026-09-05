/** Shared primitives. Everything visible is built from these. */

import {
  forwardRef,
  useEffect,
  useId,
  useRef,
  useState,
  type ButtonHTMLAttributes,
  type InputHTMLAttributes,
  type ReactNode,
  type TextareaHTMLAttributes,
} from 'react';

import { IconCheck, IconX } from './Icons';
import { useDismissible } from '../lib/dismiss';
import { initials } from '../lib/util';
import type { Person } from '../lib/types';

/* ------------------------------------------------------------------ */
/* Button                                                              */
/* ------------------------------------------------------------------ */

type ButtonVariant = 'primary' | 'plain' | 'ink' | 'ghost' | 'danger';

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: 'sm' | 'md' | 'lg';
  block?: boolean;
  icon?: ReactNode;
}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  { variant = 'plain', size = 'md', block, icon, children, className = '', type = 'button', ...rest },
  ref,
) {
  const classes = [
    'btn',
    variant !== 'plain' && `btn--${variant}`,
    size !== 'md' && `btn--${size}`,
    block && 'btn--block',
    className,
  ]
    .filter(Boolean)
    .join(' ');
  return (
    <button ref={ref} type={type} className={classes} {...rest}>
      {icon}
      {children}
    </button>
  );
});

interface IconButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  label: string;
  accent?: boolean;
}

export function IconButton({ label, accent, className = '', ...rest }: IconButtonProps) {
  return (
    <button
      type="button"
      aria-label={label}
      className={`iconbtn ${accent ? 'iconbtn--accent' : ''} ${className}`}
      {...rest}
    />
  );
}

/* ------------------------------------------------------------------ */
/* Inputs                                                              */
/* ------------------------------------------------------------------ */

interface FieldProps extends InputHTMLAttributes<HTMLInputElement> {
  label?: string;
  hint?: string;
  error?: string | null;
}

export const TextField = forwardRef<HTMLInputElement, FieldProps>(function TextField(
  { label, hint, error, className = '', id, ...rest },
  ref,
) {
  const auto = useId();
  const inputId = id ?? auto;
  return (
    <div className={`field ${error ? 'field--invalid' : ''} ${className}`}>
      {label && (
        <label className="field__label" htmlFor={inputId}>
          {label}
        </label>
      )}
      <input
        ref={ref}
        id={inputId}
        className="field__input"
        aria-invalid={error ? true : undefined}
        aria-describedby={error ? `${inputId}-err` : hint ? `${inputId}-hint` : undefined}
        {...rest}
      />
      {hint && !error && (
        <p className="field__hint" id={`${inputId}-hint`}>
          {hint}
        </p>
      )}
      {error && (
        <p className="field__error" id={`${inputId}-err`} role="alert">
          <IconX size={14} strokeWidth={3} />
          {error}
        </p>
      )}
    </div>
  );
});

interface AreaProps extends TextareaHTMLAttributes<HTMLTextAreaElement> {
  label?: string;
  hint?: string;
}

export function TextArea({ label, hint, className = '', id, ...rest }: AreaProps) {
  const auto = useId();
  const areaId = id ?? auto;
  return (
    <div className={`field ${className}`}>
      {label && (
        <label className="field__label" htmlFor={areaId}>
          {label}
        </label>
      )}
      <textarea id={areaId} className="field__input" {...rest} />
      {hint && <p className="field__hint">{hint}</p>}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Avatar                                                              */
/* ------------------------------------------------------------------ */

export function Avatar({
  person,
  size = 34,
  posted,
  dim,
  src,
}: {
  person: Person;
  size?: number;
  posted?: boolean;
  dim?: boolean;
  src?: string | null;
}) {
  return (
    <span
      className={`avatar ${dim ? 'avatar--dim' : ''}`}
      data-accent={person.accent}
      style={{ width: size, height: size, fontSize: Math.max(10, size * 0.36) }}
      title={person.name}
    >
      {src ? <img src={src} alt="" /> : initials(person.name)}
      {posted && (
        <span className="avatar__tick" aria-hidden="true">
          <IconCheck size={9} strokeWidth={4} />
        </span>
      )}
    </span>
  );
}

/* ------------------------------------------------------------------ */
/* Misc primitives                                                     */
/* ------------------------------------------------------------------ */

export function Tag({
  children,
  variant = 'plain',
  className = '',
}: {
  children: ReactNode;
  variant?: 'plain' | 'accent' | 'ink' | 'quiet';
  className?: string;
}) {
  return (
    <span className={`tag ${variant !== 'plain' ? `tag--${variant}` : ''} ${className}`}>
      {children}
    </span>
  );
}

export function Progress({ value, total }: { value: number; total: number }) {
  const pct = total > 0 ? Math.round((value / total) * 100) : 0;
  const done = total > 0 && value >= total;
  return (
    <div
      className="progress"
      role="progressbar"
      aria-valuenow={value}
      aria-valuemin={0}
      aria-valuemax={total}
      aria-label={`${value} of ${total} posted today`}
    >
      <div
        className={`progress__fill ${done ? 'progress__fill--done' : ''}`}
        style={{ width: `${pct}%` }}
      />
    </div>
  );
}

export function EmptyState({
  title,
  body,
  art,
  action,
}: {
  title: string;
  body?: string;
  art?: ReactNode;
  action?: ReactNode;
}) {
  return (
    <div className="empty">
      {art}
      <h3 className="empty__title">{title}</h3>
      {body && <p className="empty__body">{body}</p>}
      {action}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Modal                                                               */
/* ------------------------------------------------------------------ */

export function Modal({
  open,
  title,
  children,
  onClose,
  actions,
}: {
  open: boolean;
  title: string;
  children?: ReactNode;
  onClose: () => void;
  actions?: ReactNode;
}) {
  const ref = useRef<HTMLDivElement>(null);

  useDismissible(open, onClose);

  useEffect(() => {
    if (!open) return;
    // Move focus in so keyboard users land inside the dialog.
    ref.current?.querySelector<HTMLElement>('button, [href], input')?.focus();
  }, [open]);

  if (!open) return null;
  return (
    <div
      className="modal__scrim"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="modal" role="dialog" aria-modal="true" aria-label={title} ref={ref}>
        <h2 className="modal__title">{title}</h2>
        <div className="modal__body">{children}</div>
        {actions && <div className="modal__actions">{actions}</div>}
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Code input                                                          */
/* ------------------------------------------------------------------ */

/**
 * Invite codes are `XXXX-XX`. One real input sits invisibly over a row of
 * chunky boxes, so mobile keyboards, paste and a11y all behave while the
 * visuals stay ours.
 */
export function CodeInput({
  value,
  onChange,
  onComplete,
  shake,
  length = 6,
  dashAfter = 4,
}: {
  value: string;
  onChange: (next: string) => void;
  onComplete?: (code: string) => void;
  shake?: boolean;
  length?: number;
  dashAfter?: number;
}) {
  const chars = value.split('');
  const cells: ReactNode[] = [];

  for (let i = 0; i < length; i++) {
    if (i === dashAfter) cells.push(<span className="codeinput__dash" key="dash" />);
    const filled = Boolean(chars[i]);
    cells.push(
      <span
        key={i}
        className={[
          'codeinput__box',
          filled && 'codeinput__box--filled',
          !filled && i === chars.length && 'codeinput__box--active',
        ]
          .filter(Boolean)
          .join(' ')}
      >
        {chars[i] ?? ''}
      </span>,
    );
  }

  return (
    <div className={`codeinput ${shake ? 'codeinput--shake' : ''}`}>
      <div className="codeinput__boxes" aria-hidden="true">
        {cells}
      </div>
      <input
        className="codeinput__hidden"
        value={value}
        inputMode="text"
        autoCapitalize="characters"
        autoComplete="one-time-code"
        spellCheck={false}
        maxLength={length}
        aria-label="Invite code"
        onChange={(e) => {
          const next = e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, length);
          onChange(next);
          if (next.length === length) onComplete?.(next);
        }}
      />
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Copy-to-clipboard hook                                              */
/* ------------------------------------------------------------------ */

export function useCopy(): [boolean, (text: string) => Promise<boolean>] {
  const [copied, setCopied] = useState(false);

  const copy = async (text: string) => {
    const ok = await writeClipboard(text);
    if (ok) {
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1800);
    }
    return ok;
  };

  return [copied, copy];
}

async function writeClipboard(text: string): Promise<boolean> {
  try {
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(text);
      return true;
    }
  } catch {
    /* fall through to the legacy path */
  }
  try {
    const el = document.createElement('textarea');
    el.value = text;
    el.setAttribute('readonly', '');
    el.style.position = 'fixed';
    el.style.opacity = '0';
    document.body.appendChild(el);
    el.select();
    const ok = document.execCommand('copy');
    document.body.removeChild(el);
    return ok;
  } catch {
    return false;
  }
}
