import { AdminControls } from "../../../components/admin-controls";
import { CanonicalControls } from "../../../components/canonical-controls";

export default function AdminControlsPage() {
  return (
    <>
      <header className="admin-page-heading compact">
        <div>
          <p className="eyebrow">Controlled mutations</p>
          <h1>Operations control room</h1>
          <p>
            High-impact actions require a fresh administrator session, a reason, and an exact target
            confirmation checked by Fastify.
          </p>
        </div>
      </header>
      <AdminControls />
      <CanonicalControls />
    </>
  );
}
