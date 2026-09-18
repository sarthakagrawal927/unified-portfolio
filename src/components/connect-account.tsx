"use client";

import { useRef, useState } from "react";
import type { ProviderId } from "../core/model";

export function ConnectAccount({
  id,
  name,
  connected,
  ready,
  setup,
}: {
  id: ProviderId;
  name: string;
  connected: boolean;
  ready: boolean;
  setup: boolean;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const [leaving, setLeaving] = useState(false);
  const label = !ready
    ? `${name} setup needed`
    : connected
      ? "Reconnect"
      : `Connect ${name}`;
  return (
    <>
      <button
        className="button secondary"
        onClick={() => dialog.current?.showModal()}
      >
        {label}
      </button>
      <dialog
        ref={dialog}
        className="connect-dialog"
        aria-labelledby={`connect-${id}`}
      >
        <div className="connect-heading">
          <span className={`broker-logo large ${id}`}>{name[0]}</span>
          <button
            className="text-button"
            aria-label="Close connection panel"
            onClick={() => dialog.current?.close()}
          >
            Close ×
          </button>
        </div>
        <h2 id={`connect-${id}`}>
          {connected ? "Reconnect" : "Connect"} {name}
        </h2>
        <p>
          Sign in securely on {name}’s own website. Your password and
          verification codes stay with your broker.
        </p>
        <ol className="connect-steps">
          <li>
            <strong>Sign in to {name}</strong>
            <span>Continue to the official login page.</span>
          </li>
          <li>
            <strong>Approve access</strong>
            <span>Review the permissions shown by your provider.</span>
          </li>
          <li>
            <strong>Return to your portfolio</strong>
            <span>
              We sync your investments and show when they were last updated.
            </span>
          </li>
        </ol>
        {setup ? (
          <div className="notice">
            <strong>Your private installation isn’t ready yet.</strong>
            <p>
              Private storage and app sign-in must be configured before
              connecting financial accounts.
            </p>
            <a href="/settings">View installation status →</a>
          </div>
        ) : !ready ? (
          <div className="notice">
            <strong>Connection temporarily unavailable</strong>
            <p>Please try again later.</p>
          </div>
        ) : (
          <form
            action={`/api/providers/${id}/connect`}
            method="post"
            target={id === "zerodha" ? "_blank" : undefined}
            rel={id === "zerodha" ? "noopener" : undefined}
            onSubmit={() => setLeaving(true)}
          >
            <button className="button" disabled={leaving}>
              {leaving ? `Opening ${name}…` : `Continue to ${name} →`}
            </button>
          </form>
        )}
        {id === "zerodha" && ready && (
          <>
            <p>
              Login opens in a new tab. After Zerodha confirms login, return
              here to finish connecting. No developer app or API key is needed.
            </p>
            <form action="/api/providers/zerodha/finish" method="post">
              <button className="button secondary">
                Finish Zerodha connection
              </button>
            </form>
          </>
        )}
        {id === "indmoney" && (
          <p className="footnote">
            INDmoney imports your selected investment scope. USD wallet
            estimates are labeled when native USD cash is not supplied.
          </p>
        )}
        <p className="footnote">
          Unified Portfolio only reads investment data. Previously synced values
          remain available when you need to sign in again.
        </p>
      </dialog>
    </>
  );
}
