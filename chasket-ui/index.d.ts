/**
 * @chasket/chasket-ui — Type definitions
 *
 * Pre-built Web Components for Chasket applications.
 * All components use Shadow DOM and are registered as Custom Elements.
 */

// ── fl-button ──

export interface FlButtonProps {
  variant?: 'primary' | 'secondary' | 'danger' | 'ghost';
  size?: 'sm' | 'md' | 'lg';
  disabled?: boolean;
  loading?: boolean;
}

export interface FlButtonEvents {
  press: CustomEvent<void>;
}

// ── fl-input ──

export interface FlInputProps {
  label?: string;
  placeholder?: string;
  value?: string;
  disabled?: boolean;
  required?: boolean;
  error?: string;
  hint?: string;
}

export interface FlInputEvents {
  input: CustomEvent<string>;
  change: CustomEvent<string>;
}

// ── fl-card ──

export interface FlCardProps {
  variant?: 'elevated' | 'outlined' | 'flat';
  padding?: 'none' | 'sm' | 'md' | 'lg';
  clickable?: boolean;
}

export interface FlCardEvents {
  press: CustomEvent<void>;
}

// ── fl-dialog ──

export interface FlDialogProps {
  open?: boolean;
  title?: string;
  closable?: boolean;
  size?: 'sm' | 'md' | 'lg';
}

export interface FlDialogEvents {
  close: CustomEvent<void>;
}

// ── fl-badge ──

export interface FlBadgeProps {
  variant?: 'default' | 'primary' | 'success' | 'warning' | 'danger';
  size?: 'sm' | 'md';
  pill?: boolean;
  dot?: boolean;
}

// ── fl-alert ──

export interface FlAlertProps {
  variant?: 'info' | 'success' | 'warning' | 'error';
  dismissible?: boolean;
  title?: string;
}

export interface FlAlertEvents {
  dismiss: CustomEvent<void>;
}

// ── fl-tabs ──

export interface FlTabsProps {
  items?: string;
  active?: string;
  variant?: 'line' | 'pill';
}

export interface FlTabsEvents {
  change: CustomEvent<string>;
}

// ── fl-spinner ──

export interface FlSpinnerProps {
  size?: 'sm' | 'md' | 'lg';
  color?: string;
  label?: string;
}

// ── fl-toggle ──

export interface FlToggleProps {
  checked?: boolean;
  disabled?: boolean;
  label?: string;
  size?: 'sm' | 'md';
}

export interface FlToggleEvents {
  change: CustomEvent<boolean>;
}

// ── Custom Element declarations for TypeScript HTML ──

declare global {
  interface HTMLElementTagNameMap {
    'fl-button': HTMLElement & FlButtonProps;
    'fl-input': HTMLElement & FlInputProps;
    'fl-card': HTMLElement & FlCardProps;
    'fl-dialog': HTMLElement & FlDialogProps;
    'fl-badge': HTMLElement & FlBadgeProps;
    'fl-alert': HTMLElement & FlAlertProps;
    'fl-tabs': HTMLElement & FlTabsProps;
    'fl-spinner': HTMLElement & FlSpinnerProps;
    'fl-toggle': HTMLElement & FlToggleProps;
  }
}
