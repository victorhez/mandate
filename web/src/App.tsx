import { useEffect, useState } from "react";
import { Landing } from "./components/Landing";
import { Dashboard } from "./components/Dashboard";
import { useToasts } from "./lib/store";

const Mark = () => (
  <svg viewBox="0 0 64 64" aria-hidden>
    <rect width="64" height="64" rx="16" fill="#d4ff3a" />
    <circle cx="32" cy="32" r="16" fill="none" stroke="#10150a" strokeWidth="6" strokeDasharray="76 25" strokeLinecap="round" transform="rotate(-70 32 32)" />
    <circle cx="32" cy="32" r="5" fill="#10150a" />
  </svg>
);

const route = () => (location.hash.startsWith("#/app") ? "app" : "home");

export default function App() {
  const [view, setView] = useState(route());
  const toasts = useToasts();

  useEffect(() => {
    const on = () => {
      setView(route());
      if (route() === "app") window.scrollTo({ top: 0 });
    };
    window.addEventListener("hashchange", on);
    return () => window.removeEventListener("hashchange", on);
  }, []);

  const go = () => {
    location.hash = "#/app";
    window.scrollTo({ top: 0 });
  };
  const home = () => {
    history.pushState("", "", location.pathname);
    setView("home");
    window.scrollTo({ top: 0 });
  };

  return (
    <>
      <nav className="nav">
        <div className="wrap">
          <button className="logo" onClick={home} aria-label="Mandate home"><Mark />Mandate</button>
          {view === "home" && (
            <div className="nav-links">
              <a href="#problem">Problem</a>
              <a href="#how">How it works</a>
              <a href="#guardrails">Guardrails</a>
              <a href="#build">Build</a>
            </div>
          )}
          <div className="spacer" />
          {view === "home" ? (
            <button className="btn primary sm" onClick={go}>Open app</button>
          ) : (
            <button className="btn sm" onClick={home}>← Overview</button>
          )}
        </div>
      </nav>
      {view === "home" ? <Landing go={go} /> : <Dashboard />}
      <div className="toasts" role="status" aria-live="polite">
        {toasts.map((t) => (
          <div key={t.id} className={`toast ${t.kind === "err" ? "err" : ""}`}>{t.text}</div>
        ))}
      </div>
    </>
  );
}
