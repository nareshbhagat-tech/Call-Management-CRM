package com.doondecors.callcrm

import android.content.Context

/** Everything the app remembers between launches. */
class Prefs(context: Context) {
    private val sp = context.getSharedPreferences("crm", Context.MODE_PRIVATE)

    var serverUrl: String
        get() = sp.getString("server_url", "") ?: ""
        set(v) = sp.edit().putString("server_url", v.trim().trimEnd('/')).apply()

    var token: String
        get() = sp.getString("token", "") ?: ""
        set(v) = sp.edit().putString("token", v).apply()

    var userName: String
        get() = sp.getString("user_name", "") ?: ""
        set(v) = sp.edit().putString("user_name", v).apply()

    /** Folder (SAF tree URI) where the phone's built-in recorder saves call recordings. */
    var recordingsUri: String
        get() = sp.getString("recordings_uri", "") ?: ""
        set(v) = sp.edit().putString("recordings_uri", v).apply()

    /** available | break — what the agent chose; "on_call" is reported automatically while dialing. */
    var status: String
        get() = sp.getString("status", "available") ?: "available"
        set(v) = sp.edit().putString("status", v).apply()

    /** Lead being called right now, so we can open its post-call form when the call ends. */
    var pendingLeadId: Long
        get() = sp.getLong("pending_lead", -1)
        set(v) = sp.edit().putLong("pending_lead", v).apply()

    var pendingCallAt: Long
        get() = sp.getLong("pending_call_at", 0)
        set(v) = sp.edit().putLong("pending_call_at", v).apply()

    var lastSync: String
        get() = sp.getString("last_sync", "") ?: ""
        set(v) = sp.edit().putString("last_sync", v).apply()

    /** Follow-ups already notified, as "leadId@followUpTime". */
    var notified: Set<String>
        get() = sp.getStringSet("notified", emptySet()) ?: emptySet()
        set(v) = sp.edit().putStringSet("notified", v).apply()

    val signedIn get() = token.isNotEmpty() && serverUrl.isNotEmpty()

    fun signOut() {
        sp.edit().remove("token").remove("user_name").remove("pending_lead").remove("notified").apply()
    }
}
