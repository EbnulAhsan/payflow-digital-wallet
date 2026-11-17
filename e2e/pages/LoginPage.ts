import { expect, type Locator, type Page } from '@playwright/test';

export class LoginPage {
  readonly page: Page;
  readonly idInput: Locator;
  readonly passwordInput: Locator;
  readonly signInButton: Locator;
  readonly errorMessage: Locator;

  constructor(page: Page) {
    this.page = page;
    this.idInput = page.getByLabel(/mobile or email/i);
    this.passwordInput = page.getByLabel(/password/i);
    this.signInButton = page.getByRole('button', { name: /sign in/i });
    this.errorMessage = page.getByText(/invalid credentials/i);
  }

  async goto() {
    await this.page.goto('/login');
  }

  async login(id: string, password: string) {
    await this.idInput.fill(id);
    await this.passwordInput.fill(password);
    await this.signInButton.click();
  }

  async expectError() {
    await expect(this.errorMessage).toBeVisible();
  }
}