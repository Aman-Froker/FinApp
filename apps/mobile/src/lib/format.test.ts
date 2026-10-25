import { formatDate, formatMoney, formatMoneyParts, parseRupees } from './format';

test('formats minor units as rupees with Indian grouping and no float drift', () => {
  expect(formatMoney({ amountMinor: 123456, currency: 'INR' })).toBe('₹1,234.56');
  expect(formatMoney({ amountMinor: 123456789, currency: 'INR' })).toBe('₹12,34,567.89');
  expect(formatMoney({ amountMinor: -5, currency: 'INR' })).toBe('-₹0.05');
  expect(formatMoney({ amountMinor: 0, currency: 'INR' })).toBe('₹0.00');
  expect(formatMoney({ amountMinor: 123456, currency: 'GBP' }, 'en-GB')).toBe('£1,234.56');
  // The yen symbol differs by ICU build (¥ or JP¥); the point is zero minor units.
  expect(formatMoney({ amountMinor: 150000, currency: 'JPY' })).toMatch(/^[A-Z]*¥1,50,000$/);
});

test('splits an amount into sign, major and minor parts', () => {
  expect(formatMoneyParts({ amountMinor: -123456789, currency: 'INR' })).toEqual({
    sign: '-',
    major: '₹12,34,567',
    minor: '.89',
    suffix: '',
  });
  expect(formatMoneyParts({ amountMinor: 150000, currency: 'JPY' })).toMatchObject({
    sign: '',
    minor: '',
    suffix: '',
  });
  expect(formatMoneyParts({ amountMinor: 123456, currency: 'EUR' }, 'fr-FR')).toMatchObject({
    minor: ',56',
    suffix: ' €',
  });
});

test('formats a short day and month', () => {
  expect(formatDate(new Date(2026, 9, 24))).toBe('24 Oct');
});

test('negative zero formats as zero', () => {
  expect(formatMoney({ amountMinor: -0, currency: 'INR' })).toBe('₹0.00');
});

test('typed rupees become paise; anything else is not an amount', () => {
  expect(parseRupees('65,000')).toBe(6_500_000);
  expect(parseRupees('₹1,250.5')).toBe(125_050);
  expect(parseRupees('0')).toBeNull();
  expect(parseRupees('12abc')).toBeNull();
  expect(parseRupees('1.234')).toBeNull();
});
