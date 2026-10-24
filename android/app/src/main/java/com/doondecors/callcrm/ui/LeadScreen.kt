@file:OptIn(ExperimentalMaterial3Api::class)

package com.doondecors.callcrm.ui

import android.app.DatePickerDialog
import android.app.TimePickerDialog
import androidx.compose.foundation.horizontalScroll
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.rememberScrollState
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Call
import androidx.compose.material3.AssistChip
import androidx.compose.material3.Button
import androidx.compose.material3.Card
import androidx.compose.material3.CardDefaults
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.FilterChip
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.Icon
import androidx.compose.material3.LinearProgressIndicator
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableIntStateOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import com.doondecors.callcrm.Api
import com.doondecors.callcrm.ApiException
import com.doondecors.callcrm.Lead
import com.doondecors.callcrm.STAGES
import com.doondecors.callcrm.TimelineItem
import kotlinx.coroutines.delay
import kotlinx.coroutines.launch
import java.time.LocalDate
import java.time.LocalDateTime
import java.time.LocalTime
import java.time.ZoneId

private fun at11(daysAhead: Long): String =
    LocalDateTime.of(LocalDate.now().plusDays(daysAhead), LocalTime.of(11, 0)).atZone(ZoneId.systemDefault()).toInstant().toString()

/**
 * Lead details with the post-call form. After a call ends the app opens this with [afterCall];
 * in auto-dial mode it opens with [dialCountdown] to call this lead after a short pause.
 */
@Composable
fun LeadScreen(
    id: Long,
    api: Api,
    afterCall: Boolean,
    dialCountdown: Boolean,
    onBack: () -> Unit,
    onDial: (Lead) -> Unit,
    onSaved: (Long) -> Unit,
    onCancelAutoDial: () -> Unit,
    onSignedOut: () -> Unit,
) {
    val context = LocalContext.current
    val scope = rememberCoroutineScope()
    var lead by remember { mutableStateOf<Lead?>(null) }
    var timeline by remember { mutableStateOf<List<TimelineItem>>(emptyList()) }
    var error by remember { mutableStateOf<String?>(null) }
    var busy by remember { mutableStateOf(false) }
    var stage by remember { mutableStateOf("") }
    var note by remember { mutableStateOf("") }
    var followUp by remember { mutableStateOf<String?>(null) }
    var followUpChanged by remember { mutableStateOf(false) }
    var countdown by remember { mutableIntStateOf(if (dialCountdown) 5 else -1) }

    suspend fun load() {
        try {
            val (l, t) = api.lead(id)
            lead = l
            timeline = t
            stage = l.stage
            followUp = l.nextFollowUp
            followUpChanged = false
        } catch (e: ApiException) {
            if (e.status == 401) onSignedOut() else error = e.message
        } catch (e: Exception) {
            error = "Can't reach the server. Check your internet."
        }
    }

    LaunchedEffect(id) { load() }

    // Auto-dial: count down, then call, unless cancelled.
    LaunchedEffect(lead, countdown) {
        val l = lead ?: return@LaunchedEffect
        if (countdown > 0) {
            delay(1000)
            countdown--
        } else if (countdown == 0) {
            countdown = -1
            onDial(l)
        }
    }

    fun pickCustomFollowUp() {
        val now = LocalDateTime.now()
        DatePickerDialog(context, { _, y, m, d ->
            TimePickerDialog(context, { _, h, min ->
                followUp = LocalDateTime.of(y, m + 1, d, h, min).atZone(ZoneId.systemDefault()).toInstant().toString()
                followUpChanged = true
            }, 11, 0, false).show()
        }, now.year, now.monthValue - 1, now.dayOfMonth).show()
    }

    Column(Modifier.fillMaxSize()) {
        Header(lead?.name ?: "Lead", onBack = onBack)
        if (lead == null && error == null) LinearProgressIndicator(Modifier.fillMaxWidth())
        ErrorText(error)
        val l = lead ?: return@Column

        LazyColumn(Modifier.fillMaxSize(), contentPadding = androidx.compose.foundation.layout.PaddingValues(16.dp), verticalArrangement = Arrangement.spacedBy(12.dp)) {
            item {
                Text("${l.phone}${l.source?.let { " · $it" } ?: ""}", style = MaterialTheme.typography.bodyMedium)
            }
            if (countdown > 0) {
                item {
                    Card(colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.primaryContainer)) {
                        Row(Modifier.fillMaxWidth().padding(12.dp), horizontalArrangement = Arrangement.SpaceBetween) {
                            Text("Calling in $countdown…", fontWeight = FontWeight.SemiBold, modifier = Modifier.padding(top = 10.dp))
                            OutlinedButton(onClick = { countdown = -1; onCancelAutoDial() }) { Text("Stop auto-dial") }
                        }
                    }
                }
            }
            item {
                Button(onClick = { countdown = -1; onDial(l) }, modifier = Modifier.fillMaxWidth()) {
                    Icon(Icons.Default.Call, contentDescription = null)
                    Text("  Call ${l.name}")
                }
            }
            item {
                Card {
                    Column(Modifier.padding(12.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
                        Text(if (afterCall) "How did the call go?" else "Update lead", fontWeight = FontWeight.SemiBold)
                        Row(Modifier.horizontalScroll(rememberScrollState()), horizontalArrangement = Arrangement.spacedBy(6.dp)) {
                            STAGES.forEach { (value, label) ->
                                FilterChip(selected = stage == value, onClick = { stage = value }, label = { Text(label) })
                            }
                        }
                        OutlinedTextField(note, { note = it }, label = { Text("Note") }, modifier = Modifier.fillMaxWidth(), minLines = 2)
                        Text("Next follow-up: ${fmtDate(followUp)}", style = MaterialTheme.typography.bodyMedium)
                        Row(Modifier.horizontalScroll(rememberScrollState()), horizontalArrangement = Arrangement.spacedBy(6.dp)) {
                            AssistChip(onClick = { followUp = at11(1); followUpChanged = true }, label = { Text("Tomorrow 11 am") })
                            AssistChip(onClick = { followUp = at11(3); followUpChanged = true }, label = { Text("In 3 days") })
                            AssistChip(onClick = { followUp = at11(7); followUpChanged = true }, label = { Text("Next week") })
                            AssistChip(onClick = { pickCustomFollowUp() }, label = { Text("Pick date…") })
                            AssistChip(onClick = { followUp = null; followUpChanged = true }, label = { Text("Clear") })
                        }
                        Button(
                            enabled = !busy && (stage != l.stage || note.isNotBlank() || followUpChanged),
                            modifier = Modifier.fillMaxWidth(),
                            onClick = {
                                busy = true
                                error = null
                                scope.launch {
                                    try {
                                        api.updateLead(l.id, stage.takeIf { it != l.stage }, note, followUp, followUpChanged)
                                        note = ""
                                        load()
                                        onSaved(l.id)
                                    } catch (e: Exception) {
                                        error = e.message ?: "Could not save — try again"
                                    } finally {
                                        busy = false
                                    }
                                }
                            },
                        ) { Text(if (busy) "Saving…" else "Save") }
                    }
                }
            }
            item { Text("History", fontWeight = FontWeight.SemiBold) }
            if (timeline.isEmpty()) item { Text("No calls or notes yet. Calls appear here a few minutes after they end.", style = MaterialTheme.typography.bodySmall) }
            items(timeline) { t ->
                Column {
                    Text(t.text, style = MaterialTheme.typography.bodyMedium)
                    Text(
                        "${t.agent} · ${fmtDate(t.at)}${if (t.hasRecording) " · recorded" else ""}",
                        style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant,
                    )
                    HorizontalDivider(Modifier.padding(top = 8.dp))
                }
            }
        }
    }
}
