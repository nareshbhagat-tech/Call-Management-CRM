package com.doondecors.callcrm.ui

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.material3.Button
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.text.input.PasswordVisualTransformation
import androidx.compose.ui.unit.dp
import com.doondecors.callcrm.Api
import com.doondecors.callcrm.Prefs
import kotlinx.coroutines.launch

@Composable
fun LoginScreen(prefs: Prefs, api: Api, onSignedIn: () -> Unit) {
    var server by remember { mutableStateOf(prefs.serverUrl.ifEmpty { "https://" }) }
    var email by remember { mutableStateOf("") }
    var password by remember { mutableStateOf("") }
    var busy by remember { mutableStateOf(false) }
    var error by remember { mutableStateOf<String?>(null) }
    val scope = rememberCoroutineScope()

    Column(Modifier.fillMaxSize().padding(24.dp), verticalArrangement = Arrangement.spacedBy(12.dp)) {
        Text("Call CRM", style = MaterialTheme.typography.headlineMedium)
        Text("Sign in with the account your manager created for you.", style = MaterialTheme.typography.bodyMedium)
        OutlinedTextField(server, { server = it }, label = { Text("Server address") }, singleLine = true,
            keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Uri), modifier = Modifier.fillMaxWidth())
        OutlinedTextField(email, { email = it }, label = { Text("Email") }, singleLine = true,
            keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Email), modifier = Modifier.fillMaxWidth())
        OutlinedTextField(password, { password = it }, label = { Text("Password") }, singleLine = true,
            visualTransformation = PasswordVisualTransformation(),
            keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Password), modifier = Modifier.fillMaxWidth())
        if (server.startsWith("http://")) {
            Text("Warning: http:// sends your password unencrypted. Use https:// outside the office network.",
                color = MaterialTheme.colorScheme.error, style = MaterialTheme.typography.bodySmall)
        }
        error?.let { Text(it, color = MaterialTheme.colorScheme.error) }
        Button(
            enabled = !busy && email.isNotBlank() && password.isNotBlank() && server.length > 8,
            modifier = Modifier.fillMaxWidth(),
            onClick = {
                busy = true
                error = null
                scope.launch {
                    try {
                        val res = api.login(server.trim().trimEnd('/'), email.trim(), password)
                        prefs.serverUrl = server
                        prefs.token = res.getString("token")
                        prefs.userName = res.getJSONObject("user").getString("name")
                        onSignedIn()
                    } catch (e: Exception) {
                        error = e.message ?: "Could not reach the server"
                    } finally {
                        busy = false
                    }
                }
            },
        ) { Text(if (busy) "Signing in…" else "Sign in") }
    }
}
