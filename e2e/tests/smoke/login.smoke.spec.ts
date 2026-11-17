import { expect, test } from '@playwright/test';
import { DashboardPage } from '../../pages/DashboardPage';
import { LoginPage } from '../../pages/LoginPage';
import { badLogin, validUser } from '../../fixtures/users';

test.describe('Login smoke', () => {
  test('valid user reaches the dashboard', async ({ page }) => {
    const login = new LoginPage(page);
    const dashboard = new DashboardPage(page);

    await login.goto();
    await login.login(validUser.id, validUser.password);
    await dashboard.expectLoaded();
  });

  test('wrong credentials show "Invalid credentials"', async ({ page }) => {
    const login = new LoginPage(page);

    await login.goto();
    await login.login(badLogin.id, badLogin.password);
    await login.expectError();
    await expect(page).toHaveURL(/\/login/);
  });
});