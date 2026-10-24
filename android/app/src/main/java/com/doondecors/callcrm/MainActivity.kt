package com.doondecors.callcrm

import android.Manifest
import android.content.Intent
import android.content.pm.PackageManager
import android.net.Uri
import android.os.Build
import android.os.Bundle
import androidx.activity.ComponentActivity
import androidx.activity.compose.BackHandler
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.compose.setContent
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.safeDrawingPadding
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Surface
import androidx.compose.material3.lightColorScheme
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.key
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.core.content.ContextCompat
import androidx.lifecycle.lifecycleScope
import com.doondecors.callcrm.ui.LeadScreen
import com.doondecors.callcrm.ui.LeadsScreen
import com.doondecors.callcrm.ui.LoginScreen
import com.doondecors.callcrm.ui.SettingsScreen
import kotlinx.coroutines.delay
import kotlinx.coroutines.launch

sealed interface Screen {
    data object Login : Screen
    data object Leads : Screen
    data object Settings : Screen
    data class LeadDetail(val id: Long, val afterCall: Boolean = false, val dialCountdown: Boolean = false) : Screen
}

class MainActivity : ComponentActivity() {
    private lateinit var prefs: Prefs
    private lateinit var api: Api

    private var screen by mutableStateOf<Screen>(Screen.Login)

    /** Auto-dial: lead ids still to call, in order. Empty means auto-dial is off. */
    private var dialQueue by mutableStateOf<List<Long>>(emptyList())

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        prefs = Prefs(this)
        api = Api(prefs)
        screen = if (prefs.signedIn) Screen.Leads else Screen.Login
        openFromNotification(intent)
        setContent {
            MaterialTheme(colorScheme = lightColorScheme(primary = Color(0xFF0F766E), primaryContainer = Color(0xFFCCFBF1))) {
                Surface(Modifier.fillMaxSize().safeDrawingPadding()) { Root() }
            }
        }
    }

    override fun onNewIntent(intent: Intent) {
        super.onNewIntent(intent)
        openFromNotification(intent)
    }

    override fun onResume() {
        super.onResume()
        // Back from a call we started: open its post-call form and sync the call log.
        val leadId = prefs.pendingLeadId
        if (leadId > 0 && System.currentTimeMillis() - prefs.pendingCallAt > 3000) {
            prefs.pendingLeadId = -1
            screen = Screen.LeadDetail(leadId, afterCall = true)
            lifecycleScope.launch { runCatching { api.setStatus(prefs.status) } }
            // The call log entry can take a moment to appear.
            lifecycleScope.launch {
                delay(4000)
                SyncWorker.runNow(this@MainActivity)
            }
        }
    }

    private fun openFromNotification(intent: Intent?) {
        val id = intent?.getLongExtra(EXTRA_LEAD_ID, -1) ?: -1
        if (id > 0 && prefs.signedIn) screen = Screen.LeadDetail(id)
    }

    private fun dial(lead: Lead) {
        prefs.pendingLeadId = lead.id
        prefs.pendingCallAt = System.currentTimeMillis()
        lifecycleScope.launch { runCatching { api.setStatus("on_call") } }
        val canCall = ContextCompat.checkSelfPermission(this, Manifest.permission.CALL_PHONE) == PackageManager.PERMISSION_GRANTED
        // Without the call permission, open the dialer with the number filled in instead.
        startActivity(Intent(if (canCall) Intent.ACTION_CALL else Intent.ACTION_DIAL, Uri.parse("tel:${lead.phone}")))
    }

    private fun signedOut() {
        prefs.signOut()
        dialQueue = emptyList()
        screen = Screen.Login
    }

    @Composable
    private fun Root() {
        val askPermissions = rememberLauncherForActivityResult(ActivityResultContracts.RequestMultiplePermissions()) {
            SyncWorker.runNow(this)
        }
        val signedIn = screen != Screen.Login
        LaunchedEffect(signedIn) {
            if (!signedIn) return@LaunchedEffect
            val wanted = buildList {
                add(Manifest.permission.READ_CALL_LOG)
                add(Manifest.permission.CALL_PHONE)
                if (Build.VERSION.SDK_INT >= 33) add(Manifest.permission.POST_NOTIFICATIONS)
            }.filter { ContextCompat.checkSelfPermission(this@MainActivity, it) != PackageManager.PERMISSION_GRANTED }
            if (wanted.isNotEmpty()) askPermissions.launch(wanted.toTypedArray())
            // Heartbeat so the manager's dashboard shows this agent as live while the app is open.
            while (true) {
                if (prefs.pendingLeadId < 0) runCatching { api.setStatus(prefs.status) }
                delay(60_000)
            }
        }

        BackHandler(enabled = screen is Screen.LeadDetail || screen is Screen.Settings) { screen = Screen.Leads }

        when (val s = screen) {
            Screen.Login -> LoginScreen(prefs, api) {
                SyncWorker.schedule(this)
                screen = Screen.Leads
            }
            Screen.Leads -> LeadsScreen(
                prefs = prefs,
                api = api,
                autoDial = dialQueue.isNotEmpty(),
                onOpen = { screen = Screen.LeadDetail(it.id) },
                onDial = ::dial,
                onStartAutoDial = { leads ->
                    dialQueue = leads.map { it.id }
                    screen = Screen.LeadDetail(leads.first().id, dialCountdown = true)
                },
                onStopAutoDial = { dialQueue = emptyList() },
                onSettings = { screen = Screen.Settings },
                onSignedOut = ::signedOut,
            )
            Screen.Settings -> SettingsScreen(prefs, api, onBack = { screen = Screen.Leads }, onSignedOut = ::signedOut)
            // key(s): each lead screen starts with fresh state (matters when auto-dial jumps lead to lead).
            is Screen.LeadDetail -> key(s) { LeadScreen(
                id = s.id,
                api = api,
                afterCall = s.afterCall,
                dialCountdown = s.dialCountdown && dialQueue.isNotEmpty(),
                onBack = { screen = Screen.Leads },
                onDial = ::dial,
                onSaved = { savedId ->
                    // Auto-dial moves on to the next lead once the post-call form is saved.
                    val i = dialQueue.indexOf(savedId)
                    if (s.afterCall && i >= 0) {
                        val next = dialQueue.getOrNull(i + 1)
                        if (next == null) {
                            dialQueue = emptyList()
                            screen = Screen.Leads
                        } else {
                            screen = Screen.LeadDetail(next, dialCountdown = true)
                        }
                    }
                },
                onCancelAutoDial = { dialQueue = emptyList() },
                onSignedOut = ::signedOut,
            ) }
        }
    }

    companion object {
        const val EXTRA_LEAD_ID = "lead_id"
    }
}
