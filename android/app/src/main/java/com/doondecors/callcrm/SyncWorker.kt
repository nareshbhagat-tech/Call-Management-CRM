package com.doondecors.callcrm

import android.Manifest
import android.app.PendingIntent
import android.content.Context
import android.content.Intent
import android.content.pm.PackageManager
import android.net.Uri
import android.util.Log
import androidx.core.app.NotificationCompat
import androidx.core.app.NotificationManagerCompat
import androidx.core.content.ContextCompat
import androidx.work.Constraints
import androidx.work.CoroutineWorker
import androidx.work.ExistingPeriodicWorkPolicy
import androidx.work.ExistingWorkPolicy
import androidx.work.NetworkType
import androidx.work.OneTimeWorkRequestBuilder
import androidx.work.PeriodicWorkRequestBuilder
import androidx.work.WorkManager
import androidx.work.WorkerParameters
import java.io.IOException
import java.time.Instant
import java.time.LocalTime
import java.time.ZoneId
import java.time.format.DateTimeFormatter
import java.util.concurrent.TimeUnit

/**
 * Background job: reports agent status, uploads recent calls and their recordings,
 * and notifies about follow-ups that are due. Runs every 15 minutes and right after each call.
 */
class SyncWorker(context: Context, params: WorkerParameters) : CoroutineWorker(context, params) {
    private val prefs = Prefs(context)
    private val api = Api(prefs)

    override suspend fun doWork(): Result {
        if (!prefs.signedIn) return Result.success()
        return try {
            api.setStatus(prefs.status)
            val calls = syncCalls()
            notifyDueFollowUps()
            prefs.lastSync = "Synced at ${LocalTime.now().format(DateTimeFormatter.ofPattern("h:mm a"))} · $calls lead calls"
            Result.success()
        } catch (e: ApiException) {
            prefs.lastSync = "Sync failed: ${e.message}"
            if (e.status == 401) Result.success() else Result.retry()
        } catch (e: IOException) {
            prefs.lastSync = "Sync failed: no connection to server"
            Result.retry()
        }
    }

    private suspend fun syncCalls(): Int {
        val ctx = applicationContext
        if (ContextCompat.checkSelfPermission(ctx, Manifest.permission.READ_CALL_LOG) != PackageManager.PERMISSION_GRANTED) return 0
        val since = System.currentTimeMillis() - TimeUnit.DAYS.toMillis(SYNC_DAYS)
        // The server dedupes and ignores numbers that aren't leads, so re-sending the window is safe.
        val calls = CallLogReader.read(ctx, since)
        if (calls.isEmpty()) return 0
        val stored = calls.chunked(500).flatMap { api.uploadCalls(it) }
        val needRecording = stored.filter { !it.hasRecording }
        if (needRecording.isEmpty() || prefs.recordingsUri.isEmpty()) return stored.size

        val files = runCatching { RecordingFinder.list(ctx, prefs.recordingsUri, since) }
            .onFailure { Log.w(TAG, "Can't read recordings folder", it) }
            .getOrDefault(emptyList())
        val byClientId = calls.associateBy { it.clientId }
        for (s in needRecording) {
            val call = byClientId[s.clientId]?.takeIf { it.durationSec > 0 } ?: continue
            val file = RecordingFinder.pickBest(files, call) ?: continue
            val bytes = ctx.contentResolver.openInputStream(Uri.parse(file.uri))?.use { it.readBytes() } ?: continue
            api.uploadRecording(s.id, file.name, bytes)
        }
        return stored.size
    }

    private suspend fun notifyDueFollowUps() {
        val ctx = applicationContext
        val now = Instant.now()
        val due = api.leads(due = true).filter { lead -> lead.nextFollowUp?.let { Instant.parse(it) <= now } == true }
        val seen = prefs.notified
        val fresh = due.filter { "${it.id}@${it.nextFollowUp}" !in seen }
        if (fresh.isEmpty() || !NotificationManagerCompat.from(ctx).areNotificationsEnabled()) return
        val fmt = DateTimeFormatter.ofPattern("d MMM, h:mm a").withZone(ZoneId.systemDefault())
        for (lead in fresh) {
            val open = PendingIntent.getActivity(
                ctx, lead.id.toInt(),
                Intent(ctx, MainActivity::class.java).putExtra(MainActivity.EXTRA_LEAD_ID, lead.id).addFlags(Intent.FLAG_ACTIVITY_SINGLE_TOP),
                PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE,
            )
            val n = NotificationCompat.Builder(ctx, App.FOLLOW_UP_CHANNEL)
                .setSmallIcon(android.R.drawable.sym_action_call)
                .setContentTitle("Follow up: ${lead.name}")
                .setContentText("${lead.phone} · due ${fmt.format(Instant.parse(lead.nextFollowUp!!))}")
                .setContentIntent(open)
                .setAutoCancel(true)
                .build()
            try {
                NotificationManagerCompat.from(ctx).notify(lead.id.toInt(), n)
            } catch (e: SecurityException) {
                return // notification permission was revoked
            }
        }
        // Keep only entries still due, so the set doesn't grow forever.
        val stillDue = due.map { "${it.id}@${it.nextFollowUp}" }.toSet()
        prefs.notified = (seen intersect stillDue) + fresh.map { "${it.id}@${it.nextFollowUp}" }
    }

    companion object {
        private const val TAG = "SyncWorker"
        private const val SYNC_DAYS = 7L
        private val online = Constraints.Builder().setRequiredNetworkType(NetworkType.CONNECTED).build()

        // shortcut: Android runs periodic work at most every 15 minutes, so follow-up reminders can be up to 15 min late; use exact alarms if that matters.
        fun schedule(context: Context) {
            val req = PeriodicWorkRequestBuilder<SyncWorker>(15, TimeUnit.MINUTES).setConstraints(online).build()
            WorkManager.getInstance(context).enqueueUniquePeriodicWork("sync", ExistingPeriodicWorkPolicy.KEEP, req)
        }

        fun runNow(context: Context) {
            val req = OneTimeWorkRequestBuilder<SyncWorker>().setConstraints(online).build()
            WorkManager.getInstance(context).enqueueUniqueWork("sync-now", ExistingWorkPolicy.REPLACE, req)
        }
    }
}
