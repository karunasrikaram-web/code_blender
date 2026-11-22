import type { ReactNode } from 'react';

interface CardProps {
  title?: string;
  actions?: ReactNode;
  children: ReactNode;
  className?: string;
}

export default function Card({ title, actions, children, className }: CardProps) {
  const classes = ['card', className].filter(Boolean).join(' ');

  return (
    <section className={classes}>
      {(title || actions) && (
        <div className="card-header">
          {title && <h3 className="card-title">{title}</h3>}
          {actions && <div className="action-group">{actions}</div>}
        </div>
      )}
      {children}
    </section>
  );
}
