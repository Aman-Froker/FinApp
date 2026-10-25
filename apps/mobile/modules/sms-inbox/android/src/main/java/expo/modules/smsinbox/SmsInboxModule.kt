package expo.modules.smsinbox

import android.Manifest
import android.content.ComponentName
import android.content.Intent
import android.content.pm.PackageManager
import android.os.Build
import android.provider.Settings
import android.provider.Telephony
import expo.modules.kotlin.exception.CodedException
import expo.modules.kotlin.exception.Exceptions
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition

class SmsPermissionMissing : CodedException("READ_SMS has not been granted")

class SmsInboxModule : Module() {
  private val context
    get() = appContext.reactContext ?: throw Exceptions.ReactContextLost()

  private fun granted() =
    context.checkSelfPermission(Manifest.permission.READ_SMS) == PackageManager.PERMISSION_GRANTED

  override fun definition() = ModuleDefinition {
    Name("SmsInbox")

    Function("hasPermission") { granted() }

    // UPI app notifications: whether the user turned on notification access for Fin App.
    Function("hasNotificationAccess") {
      val enabled = Settings.Secure.getString(context.contentResolver, "enabled_notification_listeners") ?: ""
      enabled.split(":").any { ComponentName.unflattenFromString(it)?.packageName == context.packageName }
    }

    // Opens the system screen where the user turns notification access on; there is no prompt for it.
    Function("openNotificationAccess") {
      val component = ComponentName(context, UpiNotificationListener::class.java)
      val intent =
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.R) {
          Intent(Settings.ACTION_NOTIFICATION_LISTENER_DETAIL_SETTINGS)
            .putExtra(Settings.EXTRA_NOTIFICATION_LISTENER_COMPONENT_NAME, component.flattenToString())
        } else {
          Intent(Settings.ACTION_NOTIFICATION_LISTENER_SETTINGS)
        }
      context.startActivity(intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK))
    }

    Function("drainUpiNotes") { UpiNotes.drain(context) }

    // How many messages a scan from sinceMs will read, for the progress screen.
    AsyncFunction("countInbox") { sinceMs: Double ->
      if (!granted()) throw SmsPermissionMissing()
      context.contentResolver.query(
        Telephony.Sms.Inbox.CONTENT_URI,
        arrayOf(Telephony.Sms._ID),
        "${Telephony.Sms.DATE} >= ?",
        arrayOf(sinceMs.toLong().toString()),
        null,
      )?.use { it.count } ?: 0
    }

    // Oldest first from sinceMs inclusive, so callers page by the last date seen and dedupe on id.
    AsyncFunction("readInbox") { sinceMs: Double, limit: Int ->
      if (!granted()) throw SmsPermissionMissing()
      val out = mutableListOf<Map<String, Any?>>()
      context.contentResolver.query(
        Telephony.Sms.Inbox.CONTENT_URI,
        arrayOf(Telephony.Sms._ID, Telephony.Sms.ADDRESS, Telephony.Sms.BODY, Telephony.Sms.DATE),
        "${Telephony.Sms.DATE} >= ?",
        arrayOf(sinceMs.toLong().toString()),
        "${Telephony.Sms.DATE} ASC",
      )?.use { c ->
        while (out.size < limit && c.moveToNext()) {
          out.add(
            mapOf(
              "id" to c.getString(0),
              "sender" to (c.getString(1) ?: ""),
              "body" to (c.getString(2) ?: ""),
              "receivedAt" to c.getLong(3).toDouble(),
            ),
          )
        }
      }
      out
    }
  }
}
