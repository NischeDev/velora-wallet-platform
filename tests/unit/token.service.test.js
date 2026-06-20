import { TokenService } from '../../dist/modules/auth/token.service.js';

const environment = {
  JWT_ACCESS_SECRET: 'unit_access_secret_that_is_at_least_32_characters',
  JWT_REFRESH_SECRET: 'unit_refresh_secret_that_is_at_least_32_characters',
  JWT_ACCESS_TTL_SECONDS: 900,
  JWT_REFRESH_TTL_SECONDS: 604_800,
  PASSWORD_RESET_TTL_SECONDS: 900,
};

describe('TokenService', () => {
  const service = new TokenService(environment);
  const userId = 'ba692b3c-13b1-4e54-9533-fd3e06143595';

  test('creates and verifies an access token', () => {
    expect(service.verifyAccessToken(service.createAccessToken(userId, 3))).toEqual({
      userId,
      authVersion: 3,
    });
  });

  test('creates a hashed refresh-token record', () => {
    const refresh = service.createRefreshToken(userId, 3);
    expect(service.verifyRefreshToken(refresh.token)).toEqual({
      userId,
      tokenId: refresh.tokenId,
      authVersion: 3,
    });
    expect(refresh.tokenHash).toMatch(/^[a-f0-9]{64}$/);
    expect(refresh.tokenHash).not.toContain(refresh.token);
  });

  test('does not accept a refresh token as an access token', () => {
    expect(() => service.verifyAccessToken(service.createRefreshToken(userId, 1).token)).toThrow();
  });

  test('creates an opaque password-reset token and stores only its hash', () => {
    const reset = service.createPasswordResetToken();
    expect(reset.token).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(reset.tokenHash).toMatch(/^[a-f0-9]{64}$/);
    expect(reset.tokenHash).not.toContain(reset.token);
    expect(reset.expiresAt.getTime()).toBeGreaterThan(Date.now());
  });
});
