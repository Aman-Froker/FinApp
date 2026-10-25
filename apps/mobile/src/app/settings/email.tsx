import { useQuery } from '@tanstack/react-query';
import * as Clipboard from 'expo-clipboard';
import { useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { Button, Card, EmptyState, ScreenHeader, Skeleton, StepScreen, Text } from '@/components';
import { getSetting } from '@/data/db';
import { forwardingAddress } from '@/data/email';
import { track } from '@/lib/device';
import { useTheme } from '@/theme/ThemeProvider';
import { radius, space } from '@/theme/tokens';

// Bank domains for the Gmail filter. Matching on the domain catches every alert address a bank uses.
const BANK_DOMAINS = [
  'hdfcbank.net',
  'hdfcbank.com',
  'icicibank.com',
  'sbi.co.in',
  'axisbank.com',
  'kotak.com',
  'idfcfirstbank.com',
  'yesbank.in',
  'indusind.com',
  'pnb.co.in',
  'bankofbaroda.com',
  'canarabank.com',
];
const FILTER = `from:(${BANK_DOMAINS.join(' OR ')})`;

export default function EmailForwarding() {
  const { colors } = useTheme();
  const address = useQuery({ queryKey: ['forwarding-address'], queryFn: forwardingAddress, retry: false, staleTime: Infinity });
  const code = useQuery({ queryKey: ['gmail-code'], queryFn: () => getSetting('email.confirmationCode'), refetchInterval: 5000 });
  const [copied, setCopied] = useState<'address' | 'filter' | null>(null);

  const copy = async (what: 'address' | 'filter', text: string) => {
    await Clipboard.setStringAsync(text);
    setCopied(what);
    track('email_forwarding_copied', { what });
  };

  if (address.isPending) {
    return (
      <StepScreen>
        <ScreenHeader title="Bank emails" />
        <Skeleton height={160} round={16} />
      </StepScreen>
    );
  }
  if (!address.data) {
    return (
      <StepScreen>
        <ScreenHeader title="Bank emails" />
        <EmptyState icon="warning" title="Not available yet" body="Email forwarding is not switched on for Fin App yet. Your bank messages keep working as before." />
      </StepScreen>
    );
  }
  const box = [styles.box, { backgroundColor: colors.surface, borderColor: colors.rule }];
  return (
    <StepScreen>
      <ScreenHeader title="Bank emails" />
      <Text variant="body" color="textSecondary">
        Forward your bank alert and card statement emails here and Fin App reads them the same way it reads your bank messages. Only bank
        alerts and statements are read; nothing else from your email is kept.
      </Text>
      <Card>
        <Text variant="label" color="textSecondary">
          Your forwarding address
        </Text>
        <Text variant="bodyStrong" selectable>
          {address.data}
        </Text>
        <Button label={copied === 'address' ? 'Copied' : 'Copy address'} icon={copied === 'address' ? 'check' : undefined} variant="secondary" onPress={() => copy('address', address.data)} />
      </Card>
      {code.data ? (
        <Card style={{ backgroundColor: colors.accentSoft, borderColor: colors.accentSoft }}>
          <Text variant="label" color="textSecondary">
            Gmail confirmation code
          </Text>
          <Text variant="display" tabular selectable>
            {code.data}
          </Text>
          <Text variant="body" color="textSecondary">
            Enter this in Gmail to finish switching forwarding on.
          </Text>
        </Card>
      ) : null}
      <View style={styles.steps}>
        <Text variant="heading">Set it up in Gmail</Text>
        <Step n={1} text="On a computer, open Gmail, then Settings, See all settings, Forwarding and POP/IMAP. Add the address above." />
        <Step n={2} text="Gmail sends a confirmation code to that address. It appears on this screen within a minute; enter it in Gmail." />
        <Step n={3} text="Search Gmail with the filter below, choose Create filter, then Forward it to your Fin App address." />
        <Text variant="caption" color="textSecondary" selectable style={box}>
          {FILTER}
        </Text>
        <Button label={copied === 'filter' ? 'Copied' : 'Copy filter'} icon={copied === 'filter' ? 'check' : undefined} variant="secondary" onPress={() => copy('filter', FILTER)} />
      </View>
    </StepScreen>
  );
}

function Step({ n, text }: { n: number; text: string }) {
  return (
    <View style={styles.step}>
      <Text variant="bodyStrong" tabular>{`${n}.`}</Text>
      <Text variant="body" style={styles.grow}>
        {text}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  steps: { gap: space.md },
  step: { flexDirection: 'row', gap: space.sm },
  grow: { flex: 1, minWidth: 0 },
  box: { borderWidth: 1, borderRadius: radius.sm, padding: space.md },
});
