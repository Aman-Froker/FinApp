import { router } from 'expo-router';

import { Button, StepScreen, Text } from '@/components';

export default function Welcome() {
  return (
    <StepScreen actions={<Button label="Get started" fullWidth onPress={() => router.push('/onboarding/permission')} />}>
      <Text variant="display" accessibilityRole="header">
        Know what you can spend today
      </Text>
      <Text variant="prose" color="textSecondary">
        Fin App reads the messages your bank and UPI apps send you and works out a safe amount to spend each day. No forms and no
        budgets to set up.
      </Text>
      <Text variant="prose" color="textSecondary">
        All of the reading and maths happens on this phone.
      </Text>
    </StepScreen>
  );
}
