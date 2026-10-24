package com.doondecors.callcrm.ui

import android.content.Intent
import android.net.Uri
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.material3.Button
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.work.WorkManager
import com.doondecors.callcrm.Api
import com.doondecors.callcrm.Prefs
import com.doondecors.callcrm.SyncWorker
import kotlinx.coroutines.delay
import kotlinx.coroutines.launch

@Composable
fun SettingsScreen(prefs: Prefs, api: Api, onBack: () -> Unit, onSignedOut: () -> Unit) {
    val context = LocalContext.current
    val scope = rememberCoroutineScope()
    var folder by remember { mutableStateOf(prefs.recordingsUri) }
    var lastSync by remember { mutableStateOf(prefs.lastSync) }

    // Show sync results as the background job updates them.
    LaunchedEffect(Unit) {
        while (true) {
            lastSync = prefs.lastSync
            delay(2000)
        }
    }

    val pickFolder = rememberLauncherForActivityResult(ActivityResultContracts.OpenDocumentTree()) { uri: Uri? ->
        if (uri != null) {
            context.contentResolver.takePersistableUriPermission(uri, Intent.FLAG_GRANT_READ_URI_PERMISSION)
            prefs.recordingsUri = uri.toString()
            folder = uri.toString()
            SyncWorker.runNow(context)
        }
    }

    Column(Modifier.fillMaxSize()) {
        Header("Settings", onBack = onBack)
        Column(Modifier.padding(16.dp), verticalArrangement = Arrangement.spacedBy(12.dp)) {
            Text("Signed in as ${prefs.userName}", fontWeight = FontWeight.SemiBold)
            Text("Server: ${prefs.serverUrl}", style = MaterialTheme.typography.bodySmall)

            Text("Call recordings", fontWeight = FontWeight.SemiBold, modifier = Modifier.padding(top = 8.dp))
            Text(
                "Turn on automatic call recording in your phone's own dialer settings, then pick the folder it saves to " +
                    "(often Recordings/Call or MIUI/sound_recorder/call_rec). Recordings of calls with leads are uploaded automatically.",
                style = MaterialTheme.typography.bodySmall,
            )
            Text(
                if (folder.isEmpty()) "No folder chosen" else Uri.decode(folder).substringAfterLast(':'),
                style = MaterialTheme.typography.bodyMedium,
            )
            OutlinedButton(onClick = { pickFolder.launch(null) }) { Text(if (folder.isEmpty()) "Choose folder" else "Change folder") }

            Text("Sync", fontWeight = FontWeight.SemiBold, modifier = Modifier.padding(top = 8.dp))
            Text(lastSync.ifEmpty { "Not synced yet" }, style = MaterialTheme.typography.bodySmall)
            Text("Only calls with numbers that are leads in the CRM are uploaded. Personal calls stay on your phone.", style = MaterialTheme.typography.bodySmall)
            Button(onClick = { SyncWorker.runNow(context) }) { Text("Sync now") }

            OutlinedButton(
                modifier = Modifier.fillMaxWidth().padding(top = 24.dp),
                onClick = {
                    scope.launch {
                        runCatching { api.setStatus("offline") }
                        WorkManager.getInstance(context).cancelAllWork()
                        prefs.signOut()
                        onSignedOut()
                    }
                },
            ) { Text("Sign out") }
        }
    }
}
