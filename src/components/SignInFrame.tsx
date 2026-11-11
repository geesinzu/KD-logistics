import type { ReactNode } from "react";
import { Link } from "react-router";
import { ArrowUpRight, PackageCheck, Route, ShieldCheck } from "lucide-react";
import "./workspace.css";

export function SignInFrame({
  children,
  partner = false,
}: {
  children: ReactNode;
  partner?: boolean;
}) {
  return (
    <div className="kedi-auth">
      <aside className="auth-story">
        <Link to={partner ? "/tpl-login" : "/login"} className="auth-logo">
          <img src="/kedi-logo.png" alt="KEDI Healthcare" />
        </Link>
        <div className="auth-story-main">
          <p className="auth-eyebrow">
            {partner
              ? "LOGISTICS PARTNER WORKSPACE"
              : "KEDI LOGISTICS WORKSPACE"}
          </p>
          <h2>
            Every shipment,
            <br />a promise.
          </h2>
          <p>
            A connected journey from our warehouse to every branch. Keep every
            handoff in sight.
          </p>
          <div className="auth-route" aria-hidden="true">
            <span>
              <PackageCheck size={23} />
            </span>
            <i />
            <span>
              <Route size={23} />
            </span>
            <i />
            <span>
              <ShieldCheck size={23} />
            </span>
          </div>
          <div className="auth-route-labels">
            <span>Prepare</span>
            <span>Move</span>
            <span>Deliver</span>
          </div>
        </div>
        <div className="auth-story-footer">
          <span>KEDI Healthcare Logistics</span>
          <ArrowUpRight size={18} />
        </div>
      </aside>
      <main className="auth-form-side">
        <Link
          to={partner ? "/tpl-login" : "/login"}
          className="auth-mobile-logo"
        >
          <img src="/kedi-logo.png" alt="KEDI Healthcare" />
        </Link>
        <div className="auth-form-card">{children}</div>
        <p className="auth-footer">
          {partner
            ? "Partner access · Your assigned shipments, in one place."
            : "Staff access · One team, one connected network."}
        </p>
      </main>
    </div>
  );
}
