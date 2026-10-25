import { deleteAllData, retryServerDelete } from './device';

const mockStore = new Map<string, string>();
jest.mock('expo-secure-store', () => ({
  getItemAsync: jest.fn(async (k: string) => mockStore.get(k) ?? null),
  setItemAsync: jest.fn(async (k: string, v: string) => void mockStore.set(k, v)),
  deleteItemAsync: jest.fn(async (k: string) => void mockStore.delete(k)),
}));
const mockApi = jest.fn();
jest.mock('./api', () => {
  const actual = jest.requireActual('./api');
  return { ...actual, api: (...args: unknown[]) => mockApi(...args) };
});
const mockWipe = jest.fn();
jest.mock('@/data/db', () => ({ wipeLocalDb: () => mockWipe() }));
jest.mock('./notify', () => ({ cancelAllNotifications: jest.fn() }));

const { ApiError } = jest.requireActual('./api');

beforeEach(() => {
  mockStore.clear();
  mockStore.set('finapp.deviceToken', 'tok');
  mockApi.mockReset();
  mockWipe.mockReset();
});

test('online: the phone and the server are both cleared', async () => {
  mockApi.mockResolvedValue(undefined);
  expect(await deleteAllData()).toBe('done');
  expect(mockWipe).toHaveBeenCalled();
  expect(mockApi).toHaveBeenCalledWith('/v1/devices/me', { method: 'DELETE', token: 'tok' });
  expect([...mockStore.keys()]).toEqual([]);
});

test('offline: the phone is wiped anyway and the server deletion is retried later', async () => {
  mockApi.mockRejectedValue(new TypeError('Network request failed'));
  expect(await deleteAllData()).toBe('server_pending');
  expect(mockWipe).toHaveBeenCalled();
  expect(mockStore.get('finapp.deviceToken')).toBeUndefined();
  expect(mockStore.get('finapp.pendingServerDelete')).toBe('tok');

  mockApi.mockResolvedValue(undefined);
  expect(await retryServerDelete()).toBe(true);
  expect(mockStore.get('finapp.pendingServerDelete')).toBeUndefined();
});

test('a server copy that is already gone counts as deleted', async () => {
  mockStore.set('finapp.pendingServerDelete', 'old');
  mockApi.mockRejectedValue(new ApiError(401, 'device_deleted', 'Device not registered'));
  expect(await retryServerDelete()).toBe(true);
  expect(mockStore.has('finapp.pendingServerDelete')).toBe(false);
});
