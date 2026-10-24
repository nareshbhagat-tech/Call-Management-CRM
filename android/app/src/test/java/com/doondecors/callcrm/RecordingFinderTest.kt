package com.doondecors.callcrm

import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Test

class RecordingFinderTest {
    private val start = 1_700_000_000_000L
    private val call = PhoneCall("c1", "+91 98765 43210", "outgoing", start, durationSec = 120)
    private val end = start + 120_000

    private fun file(name: String, modified: Long, size: Long = 1000) = AudioFile("uri/$name", name, modified, size)

    @Test fun picksFileSavedClosestToCallEnd() {
        val best = RecordingFinder.pickBest(listOf(file("a.m4a", end + 90_000), file("b.m4a", end + 2_000)), call)
        assertEquals("b.m4a", best?.name)
    }

    @Test fun prefersFileNamedWithTheNumber() {
        val files = listOf(file("Call_other.m4a", end + 1_000), file("Call_9876543210_2023.m4a", end + 60_000))
        assertEquals("Call_9876543210_2023.m4a", RecordingFinder.pickBest(files, call)?.name)
    }

    @Test fun ignoresFilesOutsideTheCallWindowEmptyOrTooBig() {
        val files = listOf(
            file("before.m4a", start - 5 * 60_000),
            file("after.m4a", end + 10 * 60_000),
            file("empty.m4a", end, size = 0),
            file("huge.m4a", end, size = RecordingFinder.MAX_BYTES + 1),
        )
        assertNull(RecordingFinder.pickBest(files, call))
    }

    @Test fun callJsonHasWhatTheServerExpects() {
        val json = call.toJson()
        assertEquals("c1", json.getString("client_id"))
        assertEquals("outgoing", json.getString("direction"))
        assertEquals(120, json.getInt("duration_sec"))
        assertEquals("2023-11-14T22:13:20Z", json.getString("started_at"))
    }
}
