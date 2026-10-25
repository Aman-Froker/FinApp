import { useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { TextField } from './TextField';
import { asRupees, parseRupees } from '@/lib/format';
import { space } from '@/theme/tokens';

export type SalaryValue = { amountMinor: number; payDay: number };

// Take home and pay day, used in onboarding and settings. validate() returns paise or shows errors.
export function useSalaryForm(initial?: SalaryValue | null) {
  const [amount, setAmount] = useState(initial ? asRupees(initial.amountMinor) : '');
  const [payDay, setPayDay] = useState(initial ? String(initial.payDay) : '');
  const [errors, setErrors] = useState<{ amount?: string; payDay?: string }>({});

  const prefill = (v: SalaryValue) => {
    setAmount(asRupees(v.amountMinor));
    setPayDay(String(v.payDay));
  };

  const validate = (): SalaryValue | null => {
    const amountMinor = parseRupees(amount);
    const day = Number(payDay);
    const next = {
      amount: amountMinor ? undefined : 'Enter the amount in rupees, for example 65000',
      payDay: Number.isInteger(day) && day >= 1 && day <= 31 ? undefined : 'Enter a day from 1 to 31',
    };
    setErrors(next);
    return amountMinor && !next.payDay ? { amountMinor, payDay: day } : null;
  };

  const fields = (
    <View style={styles.form}>
      <TextField
        label="Take home each month, in rupees"
        testID="take-home"
        value={amount}
        onChangeText={setAmount}
        keyboardType="decimal-pad"
        error={errors.amount}
        accessibilityLabel="Take home each month, in rupees"
      />
      <TextField
        label="Pay day"
        testID="pay-day"
        helper="The day of the month your salary arrives"
        value={payDay}
        onChangeText={setPayDay}
        keyboardType="number-pad"
        maxLength={2}
        error={errors.payDay}
        accessibilityLabel="Pay day, the day of the month your salary arrives"
      />
    </View>
  );

  return { fields, validate, prefill };
}

const styles = StyleSheet.create({ form: { gap: space.lg } });
