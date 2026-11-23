export const validUser = {
  id: process.env.E2E_USER_ID ?? '01710000101',
  password: process.env.E2E_USER_PASSWORD ?? '',
};

// Unknown account: gives the same "Invalid credentials" message and never locks a real user.
export const badLogin = {
  id: '01600000000',
  password: 'Wrong!Pass123',
};