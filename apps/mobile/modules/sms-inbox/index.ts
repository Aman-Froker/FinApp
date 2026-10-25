import { requireOptionalNativeModule } from 'expo';

export type InboxSms = {
  id: string;
  sender: string;
  body: string;
  // Epoch milliseconds.
  receivedAt: number;
};

export type UpiNoteRaw = { app: string; title: string; text: string; postedAt: number };

// One module for both on-device sources: the SMS inbox and UPI app payment notifications.
type SmsInboxModule = {
  hasPermission(): boolean;
  hasNotificationAccess(): boolean;
  openNotificationAccess(): void;
  drainUpiNotes(): UpiNoteRaw[];
  countInbox(sinceMs: number): Promise<number>;
  readInbox(sinceMs: number, limit: number): Promise<InboxSms[]>;
};

// Null on iOS and in Expo Go, where the native module does not exist.
export const SmsInbox = requireOptionalNativeModule<SmsInboxModule>('SmsInbox');
