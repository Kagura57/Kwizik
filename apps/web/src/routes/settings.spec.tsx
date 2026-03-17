import { describe, expect, it } from "vitest";
import {
  formatSettingsSyncTimestamp,
  getAniListStatusMeta,
  getSettingsCopy,
  getSettingsPrimaryActionLabel,
  getSettingsTitlePreferenceLabel,
  getSyncErrorMessage,
  getSyncStatusLabel,
  getSyncStatusTone,
} from "../i18n/copy/settings";

describe("settings route copy helpers", () => {
  it("returns the action-first labels for the AniList CTA", () => {
    expect(
      getSettingsPrimaryActionLabel({
        locale: "en",
        currentUsername: "",
        nextUsername: "",
      }),
    ).toBe("Add username");

    expect(
      getSettingsPrimaryActionLabel({
        locale: "en",
        currentUsername: "",
        nextUsername: "akari",
      }),
    ).toBe("Connect & sync");

    expect(
      getSettingsPrimaryActionLabel({
        locale: "en",
        currentUsername: "akari",
        nextUsername: "akari",
      }),
    ).toBe("Sync again");

    expect(
      getSettingsPrimaryActionLabel({
        locale: "fr",
        currentUsername: "akari",
        nextUsername: "",
      }),
    ).toBe("Retirer le pseudo");
  });

  it("formats summary labels and statuses for the refreshed settings layout", () => {
    expect(getSettingsCopy("en").aniListConnection).toBe("AniList connection");
    expect(getSettingsCopy("fr").recoveredAnime).toBe("Bibliothèque récupérée");
    expect(getSettingsCopy("en").summaryUsernameHint).toContain("AniList sync");
    expect(getAniListStatusMeta("linked", "en")).toMatchObject({
      label: "Ready",
      tone: "connected",
    });
    expect(getSyncStatusLabel("running", "en")).toBe("Running");
    expect(getSyncStatusTone("error")).toBe("expired");
    expect(getSettingsTitlePreferenceLabel("english", "fr")).toBe("Anglais");
  });

  it("keeps sync feedback actionable", () => {
    expect(getSyncErrorMessage("ANILIST_USER_NOT_FOUND", "en")).toContain("not found");
    expect(getSyncErrorMessage("QUEUE_UNAVAILABLE", "fr")).toContain("indisponible");
    expect(formatSettingsSyncTimestamp(null, "en")).toBe("Never");
  });
});
