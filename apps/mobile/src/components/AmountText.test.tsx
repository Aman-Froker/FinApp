import { render, screen } from '@testing-library/react-native';

import { AmountText } from './AmountText';
import { ThemeProvider } from '@/theme/ThemeProvider';

test('reads the full amount to screen readers and splits minor units visually', async () => {
  await render(
    <ThemeProvider scheme="light">
      <AmountText money={{ amountMinor: -123456, currency: 'GBP' }} size="display" />
    </ThemeProvider>,
  );
  expect(screen.getByLabelText('-£1,234.56')).toBeTruthy();
  expect(screen.getByText('.56')).toBeTruthy();
});
