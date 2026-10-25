package expo.modules.smsinbox

import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.provider.Telephony
import com.facebook.react.HeadlessJsTaskService

// Wakes the JS task; the message itself is read from the inbox, so nothing is passed along.
class SmsReceiver : BroadcastReceiver() {
  override fun onReceive(context: Context, intent: Intent) {
    if (intent.action != Telephony.Sms.Intents.SMS_RECEIVED_ACTION) return
    // SMS_RECEIVED briefly allows a background app to start a service.
    context.startService(Intent(context, SmsReceivedService::class.java))
    HeadlessJsTaskService.acquireWakeLockNow(context)
  }
}
