#!/usr/bin/env bash
# Runs the Maestro flow against the emulator, after seeding the bank SMS it expects to see.
# Needs: a running emulator with the development build installed, Metro, and the API on :3000.
set -euo pipefail
adb reverse tcp:3000 tcp:3000 >/dev/null
adb reverse tcp:8081 tcp:8081 >/dev/null
adb emu sms send VM-HDFCBK "HDFC Bank: Rs 742.00 debited from a/c **4321 on 25-10-26 to DMart E2E (UPI ref 428192839999). Avl bal: Rs 40,000.00" >/dev/null
maestro test "$(dirname "$0")/../.maestro/onboarding-to-first-transaction.yaml"
