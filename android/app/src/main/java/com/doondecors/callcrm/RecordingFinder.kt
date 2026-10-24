package com.doondecors.callcrm

import android.content.Context
import android.net.Uri
import androidx.documentfile.provider.DocumentFile
import kotlin.math.abs

data class AudioFile(val uri: String, val name: String, val modified: Long, val size: Long)

/**
 * Finds the recording the phone's own call recorder saved for a call.
 * Android doesn't let apps record calls, so we pick up the built-in recorder's file instead.
 */
object RecordingFinder {
    private val AUDIO_EXT = setOf("mp3", "m4a", "aac", "amr", "wav", "ogg", "3gp", "opus")
    const val MAX_BYTES = 50L * 1024 * 1024

    /** Audio files under the chosen folder (and up to two sub-folder levels) modified after [sinceMs]. */
    fun list(context: Context, treeUri: String, sinceMs: Long): List<AudioFile> {
        val root = DocumentFile.fromTreeUri(context, Uri.parse(treeUri)) ?: return emptyList()
        val out = mutableListOf<AudioFile>()
        fun walk(dir: DocumentFile, depth: Int) {
            for (f in dir.listFiles()) {
                if (f.isDirectory && depth < 2) walk(f, depth + 1)
                val name = f.name ?: continue
                if (f.isFile && name.substringAfterLast('.', "").lowercase() in AUDIO_EXT && f.lastModified() >= sinceMs) {
                    out += AudioFile(f.uri.toString(), name, f.lastModified(), f.length())
                }
            }
        }
        walk(root, 0)
        return out
    }

    /**
     * The recording for [call]: saved between call start and 5 minutes after it ended.
     * Files whose name contains the number win; then the one saved closest to the call's end.
     */
    fun pickBest(files: List<AudioFile>, call: PhoneCall): AudioFile? {
        val digits = call.number.filter(Char::isDigit).takeLast(7)
        return files
            .filter { it.modified in (call.startedAt - 60_000)..(call.endedAt + 300_000) && it.size in 1..MAX_BYTES }
            .minWithOrNull(
                compareBy<AudioFile> { if (digits.length == 7 && it.name.filter(Char::isDigit).contains(digits)) 0 else 1 }
                    .thenBy { abs(it.modified - call.endedAt) },
            )
    }
}
