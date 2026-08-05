import { useId, type HTMLAttributes, type ReactNode } from "react";
import { UiCommandStatus, type UiCommandState } from "./UiCommandStatus";
import { UiConnectionStatus, type UiConnectionState } from "./UiConnectionStatus";

export type UiCommandSafetyPanelProps = Omit<HTMLAttributes<HTMLElement>, "title"> & {
  actions?: ReactNode;
  commandState?: UiCommandState;
  confirmationMessage?: ReactNode;
  connectionState?: UiConnectionState;
  correctionWarning?: ReactNode;
  heading?: ReactNode;
  readOnlyMessage?: ReactNode;
  syncMessage?: ReactNode;
};

export function UiCommandSafetyPanel({
  actions,
  className,
  commandState,
  confirmationMessage,
  connectionState,
  correctionWarning,
  heading = "Command safety",
  readOnlyMessage,
  syncMessage,
  ...props
}: UiCommandSafetyPanelProps) {
  const headingId = useId();
  const messages: Array<{ kind: string; content: ReactNode }> = [];
  if (confirmationMessage) messages.push({ kind: "confirmation", content: confirmationMessage });
  if (correctionWarning) messages.push({ kind: "warning", content: correctionWarning });
  if (readOnlyMessage) messages.push({ kind: "read-only", content: readOnlyMessage });
  if (syncMessage) messages.push({ kind: "sync", content: syncMessage });

  return (
    <section
      {...props}
      aria-labelledby={headingId}
      className={["ui-command-safety-panel", className].filter(Boolean).join(" ")}
    >
      <h2 id={headingId}>{heading}</h2>
      {connectionState || commandState ? (
        <div className="ui-command-safety-panel__statuses">
          {connectionState ? <UiConnectionStatus state={connectionState} /> : null}
          {commandState ? <UiCommandStatus state={commandState} /> : null}
        </div>
      ) : null}
      {messages.length > 0 ? (
        <ul className="ui-command-safety-panel__messages">
          {messages.map((message) => (
            <li className={`ui-command-safety-panel__message ui-command-safety-panel__message--${message.kind}`} key={message.kind}>
              {message.content}
            </li>
          ))}
        </ul>
      ) : null}
      {actions === undefined ? null : <div className="ui-command-safety-panel__actions">{actions}</div>}
      <p className="ui-command-safety-panel__authority-note">
        Interface state is informational. Server validation and permissions remain authoritative.
      </p>
    </section>
  );
}
