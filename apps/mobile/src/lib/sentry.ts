import * as Sentry from '@sentry/react-native';

const dsn = process.env.EXPO_PUBLIC_SENTRY_DSN;

if (dsn) {
  Sentry.init({ dsn, sendDefaultPii: false, tracesSampleRate: 0.1 });
}

export const sentryEnabled = Boolean(dsn);
export { Sentry };
