import { expect, test } from "@playwright/test";

test("player can create room and reach live play screen", async ({ page }) => {
  await page.goto("/");

  await page.getByRole("button", { name: /Créer une room|Créer et jouer/i }).click();
  await expect(page).toHaveURL(/\/room\/[A-Z2-9]{6}\/play/);
  await expect(page.getByRole("button", { name: /Lancer la partie/i })).toBeVisible();
  await expect(page.getByRole("button", { name: /AniList lié/i })).toBeVisible();
});
