package expo.modules.smsinbox

import android.content.Intent
import com.facebook.react.HeadlessJsTaskService
import com.facebook.react.bridge.Arguments
import com.facebook.react.jstasks.HeadlessJsTaskConfig

// Runs the "SmsReceived" JS task registered in index.js, with the app open or closed.
class SmsReceivedService : HeadlessJsTaskService() {
  override fun getTaskConfig(intent: Intent?): HeadlessJsTaskConfig =
    HeadlessJsTaskConfig("SmsReceived", Arguments.createMap(), 60_000L, true)
}
