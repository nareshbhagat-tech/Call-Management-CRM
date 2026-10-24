package com.doondecors.callcrm

import android.content.Context
import android.provider.CallLog
import org.json.JSONObject
import java.time.Instant

data class PhoneCall(
    val clientId: String,
    val number: String,
    val direction: String,
    val startedAt: Long,
    val durationSec: Int,
) {
    val endedAt get() = startedAt + durationSec * 1000L

    fun toJson(): JSONObject = JSONObject()
        .put("client_id", clientId)
        .put("phone", number)
        .put("direction", direction)
        .put("started_at", Instant.ofEpochMilli(startedAt).toString())
        .put("duration_sec", durationSec)
}

object CallLogReader {
    fun direction(type: Int): String? = when (type) {
        CallLog.Calls.INCOMING_TYPE -> "incoming"
        CallLog.Calls.OUTGOING_TYPE -> "outgoing"
        CallLog.Calls.MISSED_TYPE -> "missed"
        CallLog.Calls.REJECTED_TYPE, CallLog.Calls.BLOCKED_TYPE -> "rejected"
        else -> null // voicemail, answered externally, etc.
    }

    /** Calls from the phone's call log since [sinceMs]. Needs READ_CALL_LOG. */
    fun read(context: Context, sinceMs: Long): List<PhoneCall> {
        val cols = arrayOf(CallLog.Calls.NUMBER, CallLog.Calls.TYPE, CallLog.Calls.DATE, CallLog.Calls.DURATION)
        val out = mutableListOf<PhoneCall>()
        context.contentResolver.query(
            CallLog.Calls.CONTENT_URI, cols, "${CallLog.Calls.DATE} >= ?", arrayOf(sinceMs.toString()), "${CallLog.Calls.DATE} DESC",
        )?.use { c ->
            while (c.moveToNext()) {
                val number = c.getString(0)?.takeIf { it.isNotBlank() } ?: continue
                val dir = direction(c.getInt(1)) ?: continue
                val date = c.getLong(2)
                // Date + number is stable across app reinstalls, unlike the call log's row id.
                out += PhoneCall("$date-${number.filter(Char::isDigit)}", number, dir, date, c.getInt(3))
            }
        }
        return out
    }
}
