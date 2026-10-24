package com.doondecors.callcrm

import android.app.Application
import android.app.NotificationChannel
import android.app.NotificationManager

class App : Application() {
    override fun onCreate() {
        super.onCreate()
        getSystemService(NotificationManager::class.java).createNotificationChannel(
            NotificationChannel(FOLLOW_UP_CHANNEL, "Follow-up reminders", NotificationManager.IMPORTANCE_HIGH),
        )
        if (Prefs(this).signedIn) SyncWorker.schedule(this)
    }

    companion object {
        const val FOLLOW_UP_CHANNEL = "follow_ups"
    }
}
