import { expect, type Locator, type Page } from '@playwright/test';

export class DashboardPage {
  readonly page: Page;
  readonly signOutButton: Locator;

  constructor(page: Page) {
    this.page = page;
    this.signOutButton = page.getByRole('button', { name: /sign out/i });
  }

  async expectLoaded() {
    await expect(this.page).toHaveURL(/\/dashboard/);
    await expect(this.signOutButton).toBeVisible();
  }

  async signOut() {
    await this.signOutButton.click();
  }
}