import React from "react";

interface Props {
  icon?: React.ReactNode;
  title: string;
  description?: string;
  action?: { label: string; onClick: () => void };
  secondaryAction?: { label: string; onClick: () => void };
}

export default function EmptyState({ icon, title, description, action, secondaryAction }: Props) {
  return (
    <div className="studio-card p-12 text-center max-w-md mx-auto">
      {icon && (
        <div className="w-12 h-12 rounded-xl bg-studio-surface-2 border border-studio-border flex items-center justify-center mx-auto mb-4 text-studio-bronze">
          {icon}
        </div>
      )}
      <h3 className="font-display font-bold text-base text-studio-text">{title}</h3>
      {description && <p className="text-sm text-studio-text-muted mt-2 leading-relaxed">{description}</p>}
      {(action || secondaryAction) && (
        <div className="flex items-center justify-center gap-2 mt-5">
          {action && (
            <button onClick={action.onClick} className="studio-btn-primary text-xs px-4 py-2 rounded-lg">
              {action.label}
            </button>
          )}
          {secondaryAction && (
            <button onClick={secondaryAction.onClick} className="studio-btn-ghost text-xs px-4 py-2 rounded-lg">
              {secondaryAction.label}
            </button>
          )}
        </div>
      )}
    </div>
  );
}
