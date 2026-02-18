import { Link, Outlet } from "@tanstack/react-router";

export function RootLayout() {
  return (
    <main className="app-shell">
      <header className="app-header">
        <h1 className="brand">Tunaris</h1>
        <nav className="nav-links">
          <Link to="/">Accueil</Link>
          <Link to="/join">Rejoindre</Link>
        </nav>
      </header>
      <Outlet />
    </main>
  );
}
