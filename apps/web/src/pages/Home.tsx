import { Link } from 'react-router-dom';
import { useAuth } from '../auth/AuthContext';

export function HomePage() {
  const { user, firms, firm } = useAuth();
  return (
    <div className="grid gap-4 md:grid-cols-3">
      <section className="card p-5">
        <h2 className="font-semibold mb-2">Your account</h2>
        <dl className="text-ink-muted grid gap-1">
          <div><dt className="inline">Email: </dt><dd className="inline text-ink">{user?.email}</dd></div>
          <div><dt className="inline">Roles: </dt><dd className="inline text-ink">{user?.roles.join(', ')}</dd></div>
          <div><dt className="inline">Working in: </dt><dd className="inline text-ink">{firm?.name}</dd></div>
        </dl>
      </section>
      <section className="card p-5">
        <h2 className="font-semibold mb-2">User management</h2>
        <p className="text-ink-muted mb-3">Users, roles and what each role can do.</p>
        <Link className="text-brand font-medium" to="/settings/users">Manage users</Link>
      </section>
      <section className="card p-5">
        <h2 className="font-semibold mb-2">Organizations</h2>
        <p className="text-ink-muted mb-3">{firms.length} firm{firms.length === 1 ? '' : 's'}, {firms.reduce((n, f) => n + f.branches.length, 0)} branches.</p>
        <Link className="text-brand font-medium" to="/settings/firms">Manage firms</Link>
      </section>
    </div>
  );
}
