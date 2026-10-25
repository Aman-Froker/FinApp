import { monthlySetAside, monthsUntil } from './goal';

const now = new Date(2026, 9, 25);

test('the monthly set-aside spreads the goal over the whole months left, rounded up to the rupee', () => {
  expect(monthsUntil(new Date(2027, 3, 25).toISOString(), now)).toBe(6);
  expect(monthlySetAside({ name: 'Goa trip', amountMinor: 50_000_00, targetDate: new Date(2027, 3, 25).toISOString() }, now)).toBe(8_334_00);
});

test('a goal due this month or already past is set aside in one go', () => {
  expect(monthlySetAside({ name: 'Phone', amountMinor: 20_000_00, targetDate: new Date(2026, 9, 30).toISOString() }, now)).toBe(20_000_00);
  expect(monthsUntil(new Date(2026, 0, 1).toISOString(), now)).toBe(1);
});
