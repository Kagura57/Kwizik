import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

describe("anime pivot schema", () => {
  it("defines anime catalog, user library, and sync tables", () => {
    const sql = readFileSync("apps/api/src/db/schema.sql", "utf8");

    expect(sql).toContain("create table if not exists anime_catalog_anime");
    expect(sql).toContain("create table if not exists anime_catalog_alias");
    expect(sql).toContain("create table if not exists anime_theme_videos");
    expect(sql).toContain("create table if not exists anilist_account_links");
    expect(sql).toContain("create table if not exists anilist_sync_runs");
    expect(sql).toContain("create table if not exists anilist_sync_staging");
    expect(sql).toContain("create table if not exists user_anime_library_active");
  });
});
