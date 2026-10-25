import { expect, test } from 'vitest';

import { upiNote } from '../src';

// Synthetic until real notifications are collected from each app; the shapes follow what the apps show.
const GPAY = 'com.google.android.apps.nbu.paisa.user';

test.each([
  [GPAY, 'Payment successful', 'You paid ₹450.00 to Sharma General Store', { amountMinor: 45000, payee: 'Sharma General Store' }],
  ['com.phonepe.app', '₹1,250 paid to Fresh Fruits Corner', 'Paid using HDFC Bank XX4321', { amountMinor: 125000, payee: 'Fresh Fruits Corner' }],
  ['net.one97.paytm', 'Paytm', 'Payment of Rs 80 to Ramu Tea Stall successful', { amountMinor: 8000, payee: 'Ramu Tea Stall' }],
  ['com.dreamplug.androidapp', 'CRED pay', 'Sent ₹2,000 to Dr Mehta Clinic via UPI', { amountMinor: 200000, payee: 'Dr Mehta Clinic' }],
])('%s payment', (app, title, text, expected) => {
  expect(upiNote(app, title, text)).toEqual(expected);
});

test.each([
  [GPAY, 'Money received', 'Ramesh sent you ₹500'],
  [GPAY, 'Cashback', 'You won ₹10 cashback'],
  ['com.phonepe.app', 'Payment request', 'Asha requested ₹300'],
  ['com.phonepe.app', 'Payment failed', 'Payment of ₹450 to Swiggy failed'],
  [GPAY, 'Paid', 'You paid ₹99 to shop@ybl'],
  ['com.whatsapp', 'Rahul', 'paid ₹500 to the cab'],
])('ignored: %s %s', (app, title, text) => {
  expect(upiNote(app, title, text)).toBeNull();
});
