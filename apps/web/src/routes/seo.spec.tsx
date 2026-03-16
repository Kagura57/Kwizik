import { afterEach, describe, expect, it } from "vitest";
import { applyPageSeo, buildAlternateUrls, buildCanonicalUrl, clearPageSeo } from "../i18n/seo";

type MockElement = {
  tagName: string;
  attrs: Record<string, string>;
  textContent: string | null;
  remove: () => void;
  setAttribute: (name: string, value: string) => void;
};

function createMockDocument() {
  const nodes: MockElement[] = [];
  return {
    title: "",
    documentElement: { lang: "fr" },
    head: {
      appendChild: (node: MockElement) => {
        nodes.push(node);
      },
      querySelectorAll: (selector: string) =>
        selector === "[data-kwizik-seo]" ? nodes.filter((node) => node.attrs["data-kwizik-seo"]) : [],
    },
    createElement: (tagName: string): MockElement => {
      const element: MockElement = {
        tagName,
        attrs: {},
        textContent: null,
        remove: () => {
          const index = nodes.indexOf(element);
          if (index >= 0) nodes.splice(index, 1);
        },
        setAttribute: (name: string, value: string) => {
          element.attrs[name] = value;
        },
      };
      return element;
    },
    snapshot: () =>
      nodes.map((node) => `${node.tagName}:${JSON.stringify(node.attrs)}:${node.textContent ?? ""}`),
  };
}

describe("route SEO helpers", () => {
  const mockDocument = createMockDocument();

  afterEach(() => {
    clearPageSeo(mockDocument);
    mockDocument.title = "";
    mockDocument.documentElement.lang = "fr";
  });

  it("builds canonical and alternate URLs for localized pages", () => {
    expect(buildCanonicalUrl("en", "/join")).toBe("https://kwizik.app/en/join");
    expect(buildAlternateUrls("/join")).toEqual({
      fr: "https://kwizik.app/fr/join",
      en: "https://kwizik.app/en/join",
      "x-default": "https://kwizik.app/",
    });
  });

  it("applies noindex metadata and canonical links", () => {
    applyPageSeo({
      title: "Kwizik account",
      description: "Manage your profile.",
      locale: "en",
      path: "/auth",
      noindex: true,
    }, mockDocument);

    expect(mockDocument.title).toBe("Kwizik account");
    expect(mockDocument.documentElement.lang).toBe("en");
    expect(mockDocument.snapshot().join("|")).toContain('"name":"robots"');
    expect(mockDocument.snapshot().join("|")).toContain("noindex,follow");
    expect(mockDocument.snapshot().join("|")).toContain('"rel":"canonical"');
    expect(mockDocument.snapshot().join("|")).toContain("https://kwizik.app/en/auth");
  });

  it("renders JSON-LD for indexable pages", () => {
    applyPageSeo({
      title: "Blind Test Anime en ligne",
      description: "Joue a un blind test anime multijoueur.",
      locale: "fr",
      path: "/",
      jsonLd: {
        "@context": "https://schema.org",
        "@type": "FAQPage",
        name: "FAQ",
      },
    }, mockDocument);

    expect(mockDocument.snapshot().join("|")).toContain("application/ld+json");
    expect(mockDocument.snapshot().join("|")).toContain("FAQPage");
  });
});
