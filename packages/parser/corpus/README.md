# Parser corpus

One file per sender, one JSON object per line:

```json
{"sender":"VM-HDFCBK-S","body":"...","expected":{"type":"debit","amountMinor":45000,"accountLast4":"1234"}}
```

- `expected` lists only the fields the rule must get right; `null` means the message must not parse (OTPs, promotions, due reminders).
- Mask before committing: replace real account digits, balances, names and reference numbers with made-up values of the same shape. Keep the wording, spacing and line breaks exactly as the bank sent them.
- `seed.jsonl` holds formats written from public examples to prove the harness. Replace them with real masked messages; the target is 90 percent or more per sender for the top 10 banks.
- `pnpm --filter @finapp/parser test` runs every line and prints the pass rate per sender.
