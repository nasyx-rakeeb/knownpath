import Link from "next/link";

import { DeviceAuthorization } from "../../components/device-authorization";

export default async function DevicePage({
  searchParams,
}: {
  readonly searchParams: Promise<{ user_code?: string }>;
}) {
  const userCode = (await searchParams).user_code?.trim();
  return (
    <main className="auth-page">
      <Link className="wordmark auth-wordmark" href="/">
        KnownPath
      </Link>
      <section className="auth-panel" aria-labelledby="device-title">
        <p className="eyebrow">CLI authorization</p>
        <h1 id="device-title">Connect this device</h1>
        {userCode === undefined || userCode.length < 6 ? (
          <p className="form-error" role="alert">
            The authorization code is missing or invalid. Return to your terminal and start again.
          </p>
        ) : (
          <DeviceAuthorization userCode={userCode} />
        )}
      </section>
    </main>
  );
}
