import { usePageSeo } from "../i18n/seo";

export function RootLanguagePage() {
  usePageSeo({
    title: "Kwizik | Choose your language",
    description:
      "Select French or English before entering Kwizik, the multiplayer anime blind test platform.",
    locale: "en",
    path: "/",
    noindex: true,
  });

  return (
    <main className="app-shell language-entry-shell">
      <section className="single-panel">
        <article className="panel-card language-entry-card">
          <p className="kicker">Kwizik</p>
          <h1 className="panel-title">Choose your language</h1>
          <p className="panel-copy">
            Select the experience you want to browse. Les deux versions de Kwizik sont
            disponibles ci-dessous.
          </p>
          <div className="waiting-actions">
            <a className="solid-btn" href="/fr">
              Francais
            </a>
            <a className="ghost-btn" href="/en">
              English
            </a>
          </div>
        </article>
      </section>
    </main>
  );
}
