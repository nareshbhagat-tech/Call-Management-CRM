package com.doondecors.callcrm

import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import okhttp3.MediaType.Companion.toMediaType
import okhttp3.MultipartBody
import okhttp3.OkHttpClient
import okhttp3.Request
import okhttp3.RequestBody
import okhttp3.RequestBody.Companion.toRequestBody
import org.json.JSONArray
import org.json.JSONObject
import java.io.IOException
import java.util.concurrent.TimeUnit

class ApiException(val status: Int, message: String) : IOException(message)

data class Lead(
    val id: Long,
    val name: String,
    val phone: String,
    val stage: String,
    val source: String?,
    val nextFollowUp: String?,
    val lastCallAt: String?,
) {
    companion object {
        fun from(o: JSONObject) = Lead(
            id = o.getLong("id"),
            name = o.getString("name"),
            phone = o.getString("phone"),
            stage = o.getString("stage"),
            source = o.optStringOrNull("source"),
            nextFollowUp = o.optStringOrNull("next_follow_up"),
            lastCallAt = o.optStringOrNull("last_call_at"),
        )
    }
}

data class TimelineItem(val kind: String, val text: String, val agent: String, val at: String, val hasRecording: Boolean)

data class StoredCall(val clientId: String, val id: Long, val hasRecording: Boolean)

val STAGES = listOf("new" to "New", "contacted" to "Contacted", "interested" to "Interested", "follow_up" to "Follow-up", "won" to "Won", "lost" to "Lost")
fun stageLabel(s: String) = STAGES.firstOrNull { it.first == s }?.second ?: s

fun JSONObject.optStringOrNull(key: String): String? = if (isNull(key) || !has(key)) null else getString(key)

/** Talks to the CRM server's JSON API with the signed-in agent's token. */
class Api(private val prefs: Prefs) {
    private val client = OkHttpClient.Builder()
        .connectTimeout(15, TimeUnit.SECONDS)
        .readTimeout(60, TimeUnit.SECONDS)
        .writeTimeout(120, TimeUnit.SECONDS)
        .build()

    private val jsonType = "application/json".toMediaType()

    private suspend fun send(method: String, path: String, body: RequestBody? = null, baseUrl: String = prefs.serverUrl): JSONObject =
        withContext(Dispatchers.IO) {
            val req = Request.Builder().url(baseUrl.trimEnd('/') + path).method(method, body)
            if (prefs.token.isNotEmpty()) req.header("Authorization", "Bearer ${prefs.token}")
            client.newCall(req.build()).execute().use { res ->
                val text = res.body?.string().orEmpty()
                val json = runCatching { JSONObject(text) }.getOrNull()
                if (!res.isSuccessful) throw ApiException(res.code, json?.optString("error")?.takeIf { it.isNotEmpty() } ?: "Server error (${res.code})")
                json ?: throw ApiException(res.code, "Unexpected response from server — is the address right?")
            }
        }

    private fun JSONObject.body() = toString().toRequestBody(jsonType)

    suspend fun login(serverUrl: String, email: String, password: String): JSONObject =
        send("POST", "/api/auth/login", JSONObject().put("email", email).put("password", password).body(), baseUrl = serverUrl)

    suspend fun leads(due: Boolean = false): List<Lead> {
        val arr = send("GET", "/api/leads" + if (due) "?due=1" else "").getJSONArray("leads")
        return (0 until arr.length()).map { Lead.from(arr.getJSONObject(it)) }
    }

    suspend fun lead(id: Long): Pair<Lead, List<TimelineItem>> {
        val o = send("GET", "/api/leads/$id")
        val arr = o.getJSONArray("timeline")
        val items = (0 until arr.length()).map { i ->
            val t = arr.getJSONObject(i)
            val text = if (t.getString("kind") == "note") t.getString("text") else callText(t)
            TimelineItem(t.getString("kind"), text, t.getString("agent_name"), t.getString("at"), t.optStringOrNull("recording_file") != null)
        }
        return Lead.from(o.getJSONObject("lead")) to items
    }

    private fun callText(t: JSONObject): String {
        val dir = t.getString("direction").replaceFirstChar { it.uppercase() }
        val sec = t.getInt("duration_sec")
        val dur = if (sec > 0) "${sec / 60}m ${sec % 60}s" else "not connected"
        return "$dir call · $dur" + (t.optStringOrNull("outcome")?.let { " · $it" } ?: "")
    }

    /** Send only the fields that changed; a null followUp clears it. */
    suspend fun updateLead(id: Long, stage: String?, note: String?, followUp: String?, changeFollowUp: Boolean): Lead {
        val body = JSONObject()
        stage?.let { body.put("stage", it) }
        note?.takeIf { it.isNotBlank() }?.let { body.put("note", it.trim()) }
        if (changeFollowUp) body.put("next_follow_up", followUp ?: JSONObject.NULL)
        return Lead.from(send("PATCH", "/api/leads/$id", body.body()).getJSONObject("lead"))
    }

    suspend fun setStatus(status: String) {
        send("POST", "/api/status", JSONObject().put("status", status).body())
    }

    suspend fun uploadCalls(calls: List<PhoneCall>): List<StoredCall> {
        val arr = JSONArray()
        calls.forEach { arr.put(it.toJson()) }
        val stored = send("POST", "/api/calls", JSONObject().put("calls", arr).body()).getJSONArray("stored")
        return (0 until stored.length()).map {
            val s = stored.getJSONObject(it)
            StoredCall(s.getString("client_id"), s.getLong("id"), s.getBoolean("has_recording"))
        }
    }

    suspend fun uploadRecording(callId: Long, fileName: String, bytes: ByteArray) {
        val body = MultipartBody.Builder().setType(MultipartBody.FORM)
            .addFormDataPart("file", fileName, bytes.toRequestBody("application/octet-stream".toMediaType()))
            .build()
        send("POST", "/api/calls/$callId/recording", body)
    }
}
