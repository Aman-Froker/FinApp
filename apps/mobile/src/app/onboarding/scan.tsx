import { useQuery, useQueryClient } from '@tanstack/react-query';
import { router } from 'expo-router';
import { useEffect, useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { ErrorState, ProgressRing, StepScreen, Text } from '@/components';
import { localStats, runFallback, syncInbox, type SyncProgress } from '@/data/ingest';
import { track } from '@/lib/device';
import { space } from '@/theme/tokens';

export default function Scan() {
  const queryClient = useQueryClient();
  const [progress, setProgress] = useState<SyncProgress>({ scanned: 0, total: 0 });
  const scan = useQuery({
    queryKey: ['onboarding-scan'],
    retry: false,
    staleTime: Infinity,
    gcTime: 0,
    queryFn: async () => {
      const r = await syncInbox(setProgress);
      const stats = await localStats();
      track('history_parsed', {
        scanned: r.scanned,
        financial: r.financial,
        parsed: r.parsed,
        seconds: r.seconds,
        ruleRate: stats.financial ? Math.round((100 * (stats.byRule + stats.byGeneric)) / stats.financial) : 0,
      });
      // Best effort: the model fallback must never hold up or break the scan.
      await runFallback().catch(() => 0);
      return r;
    },
  });

  useEffect(() => {
    if (!scan.data) return;
    void queryClient.invalidateQueries({ queryKey: ['history'] });
    router.replace('/onboarding/budget');
  }, [scan.data, queryClient]);

  const share = progress.total ? progress.scanned / progress.total : 0;
  return (
    <StepScreen>
      <Text variant="display" accessibilityRole="header">
        Reading the last 12 months
      </Text>
      {scan.isError ? (
        <ErrorState message={scan.error instanceof Error ? scan.error.message : 'Could not read your messages.'} onRetry={() => void scan.refetch()} />
      ) : (
        <View style={styles.centre}>
          <ProgressRing value={share} size={160} stroke={12} accessibilityLabel={`${Math.round(share * 100)} percent of messages read`}>
            <Text variant="title" tabular>
              {Math.round(share * 100)}%
            </Text>
          </ProgressRing>
          <Text variant="body" color="textSecondary" tabular accessibilityLiveRegion="polite">
            {progress.total
              ? `${progress.scanned.toLocaleString('en-IN')} of ${progress.total.toLocaleString('en-IN')} messages`
              : 'Counting your messages'}
          </Text>
          <Text variant="caption" color="textSecondary" align="center">
            Personal messages and OTPs are skipped as we go.
          </Text>
        </View>
      )}
    </StepScreen>
  );
}

const styles = StyleSheet.create({
  centre: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: space.lg, paddingBottom: space.xxxl },
});
