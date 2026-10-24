@file:OptIn(ExperimentalMaterial3Api::class)

package com.doondecors.callcrm.ui

import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Call
import androidx.compose.material.icons.filled.Refresh
import androidx.compose.material.icons.filled.Settings
import androidx.compose.material3.Button
import androidx.compose.material3.Card
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.FilterChip
import androidx.compose.material3.FilledIconButton
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.LinearProgressIndicator
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Tab
import androidx.compose.material3.TabRow
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableIntStateOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import com.doondecors.callcrm.Api
import com.doondecors.callcrm.ApiException
import com.doondecors.callcrm.Lead
import com.doondecors.callcrm.Prefs
import com.doondecors.callcrm.stageLabel
import kotlinx.coroutines.launch

@Composable
fun LeadsScreen(
    prefs: Prefs,
    api: Api,
    autoDial: Boolean,
    onOpen: (Lead) -> Unit,
    onDial: (Lead) -> Unit,
    onStartAutoDial: (List<Lead>) -> Unit,
    onStopAutoDial: () -> Unit,
    onSettings: () -> Unit,
    onSignedOut: () -> Unit,
) {
    var tab by rememberSaveable { mutableIntStateOf(0) }
    var query by rememberSaveable { mutableStateOf("") }
    var leads by remember { mutableStateOf<List<Lead>>(emptyList()) }
    var loading by remember { mutableStateOf(false) }
    var error by remember { mutableStateOf<String?>(null) }
    var reload by remember { mutableIntStateOf(0) }
    var status by remember { mutableStateOf(prefs.status) }
    val scope = rememberCoroutineScope()

    LaunchedEffect(tab, reload) {
        loading = true
        error = null
        try {
            leads = api.leads(due = tab == 1)
        } catch (e: ApiException) {
            if (e.status == 401) onSignedOut() else error = e.message
        } catch (e: Exception) {
            error = "Can't reach the server. Check your internet."
        } finally {
            loading = false
        }
    }

    val shown = leads.filter {
        query.isBlank() || it.name.contains(query, ignoreCase = true) || it.phone.filter(Char::isDigit).contains(query.filter(Char::isDigit).ifEmpty { "\u0000" })
    }

    Column(Modifier.fillMaxSize()) {
        Header(prefs.userName.ifEmpty { "My leads" }) {
            IconButton(onClick = { reload++ }) { Icon(Icons.Default.Refresh, contentDescription = "Refresh") }
            IconButton(onClick = onSettings) { Icon(Icons.Default.Settings, contentDescription = "Settings") }
        }
        Row(Modifier.padding(horizontal = 16.dp), horizontalArrangement = Arrangement.spacedBy(8.dp), verticalAlignment = Alignment.CenterVertically) {
            listOf("available" to "Available", "break" to "On break").forEach { (value, label) ->
                FilterChip(
                    selected = status == value,
                    onClick = {
                        status = value
                        prefs.status = value
                        scope.launch { runCatching { api.setStatus(value) } }
                    },
                    label = { Text(label) },
                )
            }
            Column(Modifier.weight(1f), horizontalAlignment = Alignment.End) {
                if (autoDial) {
                    OutlinedButton(onClick = onStopAutoDial) { Text("Stop auto-dial") }
                } else {
                    Button(enabled = shown.isNotEmpty(), onClick = { onStartAutoDial(shown) }) { Text("Auto-dial") }
                }
            }
        }
        TabRow(selectedTabIndex = tab, modifier = Modifier.padding(top = 8.dp)) {
            Tab(selected = tab == 0, onClick = { tab = 0 }, text = { Text("My leads") })
            Tab(selected = tab == 1, onClick = { tab = 1 }, text = { Text("Follow-ups due") })
        }
        if (loading) LinearProgressIndicator(Modifier.fillMaxWidth())
        OutlinedTextField(
            query, { query = it }, placeholder = { Text("Search name or number") }, singleLine = true,
            modifier = Modifier.fillMaxWidth().padding(horizontal = 16.dp, vertical = 8.dp),
        )
        ErrorText(error)
        if (!loading && shown.isEmpty() && error == null) {
            Text(
                if (tab == 1) "No follow-ups due. Nice work!" else "No leads assigned to you yet.",
                modifier = Modifier.padding(16.dp), style = MaterialTheme.typography.bodyMedium,
            )
        }
        LazyColumn(contentPadding = PaddingValues(start = 16.dp, end = 16.dp, bottom = 24.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
            items(shown, key = { it.id }) { lead -> LeadCard(lead, onOpen = { onOpen(lead) }, onDial = { onDial(lead) }) }
        }
    }
}

@Composable
private fun LeadCard(lead: Lead, onOpen: () -> Unit, onDial: () -> Unit) {
    Card(Modifier.fillMaxWidth().clickable(onClick = onOpen)) {
        Row(Modifier.padding(12.dp), verticalAlignment = Alignment.CenterVertically) {
            Column(Modifier.weight(1f)) {
                Text(lead.name, fontWeight = FontWeight.SemiBold)
                Text("${lead.phone} · ${stageLabel(lead.stage)}", style = MaterialTheme.typography.bodySmall)
                lead.nextFollowUp?.let {
                    Text(
                        "Follow-up ${fmtDate(it)}",
                        style = MaterialTheme.typography.bodySmall,
                        color = if (isOverdue(it)) MaterialTheme.colorScheme.error else MaterialTheme.colorScheme.onSurfaceVariant,
                    )
                }
            }
            FilledIconButton(onClick = onDial) { Icon(Icons.Default.Call, contentDescription = "Call ${lead.name}") }
        }
    }
}
