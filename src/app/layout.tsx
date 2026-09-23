import type { Metadata } from "next";
import Link from "next/link";
import { ownerSession } from "../server/auth";
import { Nav } from "../components/nav";
import "./globals.css";
export const metadata: Metadata = {
  title: "Unified Portfolio",
  description: "Private investment observability",
  robots: { index: false, follow: false },
};
export const dynamic = "force-dynamic";
export default async function Layout({
  children,
}: {
  children: React.ReactNode;
}) {
  const signedIn = Boolean(await ownerSession());
  return (
    <html lang="en">
      <head>
        <script
          defer
          src="https://health.sassmaker.com/tracker.js"
          data-key="ahk_pub_a5f420d99d3c8a9dad6e30bb188989248c445cac80cc0aa011399d11b3b79678"
          data-project="app-72bfc54f-c331-409f-b486-ca1382e53e98"
          data-identity="persistent"
          data-endpoint="https://ingest.sassmaker.com/v1/browser"
        />
      </head>
      <body>
        <a className="skip" href="#main">
          Skip to content
        </a>
        <div className="app">
          <aside className="sidebar">
            <Link href="/" className="brand">
              <span className="brand-mark">u.</span>
              <span>
                Unified<small>PORTFOLIO</small>
              </span>
            </Link>
            {signedIn && (
              <>
                <div className="nav-label">YOUR INVESTMENTS</div>
                <Nav />
              </>
            )}
            <div className="sidebar-bottom">
              <span className="lock">◈</span>
              <div>
                Private by design<small>Read-only connections</small>
              </div>
            </div>
          </aside>
          <div className="workspace">
            <div className="topbar">
              <span>
                {signedIn
                  ? "Personal investment dashboard"
                  : "Unified Portfolio"}
              </span>
              <span className="owner-mark">
                {signedIn ? "Personal workspace" : "Secure sign-in"}
              </span>
            </div>
            <main id="main">{children}</main>
            <footer>
              Unified Portfolio <span>Observe clearly. Stay in control.</span>
            </footer>
          </div>
        </div>
      </body>
    </html>
  );
}
