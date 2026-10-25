import * as SecureStore from 'expo-secure-store';

const ACCESS = 'finapp.accessToken';
const REFRESH = 'finapp.refreshToken';

export type StoredTokens = { accessToken: string; refreshToken: string };

// Tokens live in the device keychain / keystore, never in AsyncStorage.
export const tokenStore = {
  async get(): Promise<StoredTokens | null> {
    const [accessToken, refreshToken] = await Promise.all([
      SecureStore.getItemAsync(ACCESS),
      SecureStore.getItemAsync(REFRESH),
    ]);
    return accessToken && refreshToken ? { accessToken, refreshToken } : null;
  },
  async set(tokens: StoredTokens): Promise<void> {
    await Promise.all([
      SecureStore.setItemAsync(ACCESS, tokens.accessToken),
      SecureStore.setItemAsync(REFRESH, tokens.refreshToken),
    ]);
  },
  async clear(): Promise<void> {
    await Promise.all([SecureStore.deleteItemAsync(ACCESS), SecureStore.deleteItemAsync(REFRESH)]);
  },
};
