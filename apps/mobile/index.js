import { AppRegistry } from 'react-native';

import { smsReceived } from './src/data/smsTask';

// Registered before the app so the SMS receiver can run it while the app is closed.
AppRegistry.registerHeadlessTask('SmsReceived', () => smsReceived);

import 'expo-router/entry';
