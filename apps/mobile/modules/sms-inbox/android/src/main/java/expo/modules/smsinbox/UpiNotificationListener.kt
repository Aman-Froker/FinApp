package expo.modules.smsinbox

import android.app.Notification
import android.content.Context
import android.content.Intent
import android.service.notification.NotificationListenerService
import android.service.notification.StatusBarNotification
import com.facebook.react.HeadlessJsTaskService
import java.io.File
import org.json.JSONArray
import org.json.JSONObject

// Keeps payment notifications from the four UPI apps so the app can name the merchant a bank SMS
// left as a bare UPI ID. Every other notification is ignored and never stored. Same package list
// as UPI_APPS in packages/parser/src/upiNotes.ts.
class UpiNotificationListener : NotificationListenerService() {
  override fun onNotificationPosted(sbn: StatusBarNotification) {
    if (sbn.packageName !in UPI_APPS) return
    val extras = sbn.notification.extras
    val title = extras.getCharSequence(Notification.EXTRA_TITLE)?.toString() ?: ""
    val text = (extras.getCharSequence(Notification.EXTRA_BIG_TEXT) ?: extras.getCharSequence(Notification.EXTRA_TEXT))?.toString() ?: ""
    if (!RUPEES.containsMatchIn("$title $text")) return
    UpiNotes.add(this, sbn.packageName, title, text, sbn.postTime)
    // Match it now if possible; if Android refuses a background start, the next refresh picks it up.
    try {
      startService(Intent(this, SmsReceivedService::class.java))
      HeadlessJsTaskService.acquireWakeLockNow(this)
    } catch (_: IllegalStateException) {
    }
  }

  companion object {
    val UPI_APPS = setOf("com.google.android.apps.nbu.paisa.user", "com.phonepe.app", "net.one97.paytm", "com.dreamplug.androidapp")
    private val RUPEES = Regex("₹|Rs\\.?\\s?\\d|INR\\s?\\d")
  }
}

// A small queue drained by JavaScript on each refresh. It lives in noBackupFilesDir, which Android
// never copies to cloud backup or a new phone: SharedPreferences would be backed up to Google Drive.
object UpiNotes {
  private const val FILE = "upi_notes.json"
  private const val MAX = 100

  private fun file(context: Context) = File(context.noBackupFilesDir, FILE)

  private fun read(context: Context): JSONArray =
    try {
      JSONArray(file(context).readText())
    } catch (_: Exception) {
      JSONArray()
    }

  @Synchronized
  fun add(context: Context, app: String, title: String, text: String, postedAt: Long) {
    val queue = read(context)
    queue.put(JSONObject().put("app", app).put("title", title).put("text", text).put("postedAt", postedAt.toDouble()))
    while (queue.length() > MAX) queue.remove(0)
    file(context).writeText(queue.toString())
  }

  @Synchronized
  fun drain(context: Context): List<Map<String, Any>> {
    val queue = read(context)
    file(context).delete()
    return (0 until queue.length()).map { i ->
      val o = queue.getJSONObject(i)
      mapOf("app" to o.getString("app"), "title" to o.getString("title"), "text" to o.getString("text"), "postedAt" to o.getDouble("postedAt"))
    }
  }
}
