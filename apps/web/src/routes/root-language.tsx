import { motion, useReducedMotion } from "motion/react";
import { usePageSeo } from "../i18n/seo";
import { impactHeroVariants, impactPageVariants } from "../lib/impactMotion";

export function RootLanguagePage() {
  const reduceMotion = useReducedMotion();
  const stageMotion = reduceMotion
    ? {}
    : ({
        initial: "hidden",
        animate: "show",
      } as const);
  usePageSeo({
    title: "Kwizik | Choose your language",
    description:
      "Select French or English before entering Kwizik, the multiplayer anime blind test platform.",
    locale: "en",
    path: "/",
    noindex: true,
    socialImagePath: "/og/kwizik-default.svg",
    socialImageAlt: "Kwizik language selection social card",
  });

  return (
    <motion.main className="app-shell language-entry-shell" variants={impactPageVariants} {...stageMotion}>
      <section className="single-panel">
        <motion.article className="panel-card language-entry-card" variants={impactHeroVariants}>
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
        </motion.article>
      </section>
    </motion.main>
  );
}
