import { describe, expect, it } from "vitest";
import { router } from "../router";

function collectRouteIds(route: { id: string; children?: Array<{ id: string; children?: unknown[] }> }) {
  const ids = [route.id];
  for (const child of route.children ?? []) {
    ids.push(...collectRouteIds(child as { id: string; children?: Array<{ id: string; children?: unknown[] }> }));
  }
  return ids;
}

describe("router layout", () => {
  it("includes localized routes for the app shell", () => {
    const routeIds = collectRouteIds(router.routeTree);
    expect(routeIds.join("|")).toContain("/$locale");
    expect(routeIds.join("|")).toContain("/$locale/join");
    expect(routeIds.join("|")).toContain("/$locale/auth");
    expect(routeIds.join("|")).toContain("/$locale/settings");
    expect(routeIds.join("|")).toContain("/room/$roomCode/play");
    expect(routeIds.join("|")).toContain("/room/$roomCode/view");
  });
});
