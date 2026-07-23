import { useId, type MouseEventHandler, type ReactNode } from "react";

export type AuthenticatedDashboardNavigationItem = {
  current?: boolean;
  href: string;
  label: ReactNode;
  onClick?: MouseEventHandler<HTMLAnchorElement>;
};

export type AuthenticatedDashboardShellProps = {
  actions?: ReactNode;
  brand: {
    href: string;
    label: ReactNode;
    onClick?: MouseEventHandler<HTMLAnchorElement>;
  };
  children: ReactNode;
  contentMode?: "normal" | "wide" | "dense";
  contextLabel?: ReactNode;
  navigationItems: AuthenticatedDashboardNavigationItem[];
  navigationLabel?: string;
  secondaryLabel?: string;
  secondaryRail?: ReactNode;
  statusContent?: ReactNode;
  subtitle?: ReactNode;
  title: ReactNode;
  userContent?: ReactNode;
};

export function AuthenticatedDashboardShell({
  actions,
  brand,
  children,
  contentMode = "normal",
  contextLabel,
  navigationItems,
  navigationLabel = "Authenticated dashboard navigation",
  secondaryLabel = "Dashboard status and context",
  secondaryRail,
  statusContent,
  subtitle,
  title,
  userContent
}: AuthenticatedDashboardShellProps) {
  const titleId = useId();
  const bodyClassName = [
    "authenticated-dashboard-body",
    secondaryRail ? "authenticated-dashboard-body--with-secondary" : null
  ].filter(Boolean).join(" ");

  return (
    <div className="authenticated-dashboard-shell">
      <header className="authenticated-dashboard-header">
        <div className="authenticated-dashboard-identity">
          <a className="authenticated-dashboard-brand" href={brand.href} onClick={brand.onClick}>
            {brand.label}
          </a>
          {contextLabel ? <span className="authenticated-dashboard-context">{contextLabel}</span> : null}
        </div>
        <div className="authenticated-dashboard-heading">
          <h1 id={titleId}>{title}</h1>
          {subtitle ? <p>{subtitle}</p> : null}
        </div>
        {statusContent || userContent || actions ? (
          <div className="authenticated-dashboard-account-region">
            {statusContent ? <div className="authenticated-dashboard-status">{statusContent}</div> : null}
            {userContent ? <div className="authenticated-dashboard-user">{userContent}</div> : null}
            {actions ? <div className="authenticated-dashboard-actions">{actions}</div> : null}
          </div>
        ) : null}
      </header>

      <nav className="authenticated-dashboard-navigation" aria-label={navigationLabel}>
        <ul>
          {navigationItems.map((item) => (
            <li key={item.href}>
              <a
                aria-current={item.current ? "page" : undefined}
                href={item.href}
                onClick={item.onClick}
              >
                {item.label}
              </a>
            </li>
          ))}
        </ul>
      </nav>

      <div className={bodyClassName}>
        <main
          aria-labelledby={titleId}
          className={`authenticated-dashboard-main authenticated-dashboard-main--${contentMode}`}
        >
          {children}
        </main>
        {secondaryRail ? (
          <aside className="authenticated-dashboard-secondary" aria-label={secondaryLabel}>
            {secondaryRail}
          </aside>
        ) : null}
      </div>
    </div>
  );
}
