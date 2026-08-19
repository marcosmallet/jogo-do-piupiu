package br.com.travessiadocanarinho.tv

import android.view.KeyEvent
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Test

class TvKeyMapperTest {
    @Test
    fun mapsRemoteAndGamepadKeys() {
        assertEquals("up", TvKeyMapper.actionFor(KeyEvent.KEYCODE_DPAD_UP))
        assertEquals("down", TvKeyMapper.actionFor(KeyEvent.KEYCODE_DPAD_DOWN))
        assertEquals("confirm", TvKeyMapper.actionFor(KeyEvent.KEYCODE_ENTER))
        assertEquals("confirm", TvKeyMapper.actionFor(KeyEvent.KEYCODE_NUMPAD_ENTER))
        assertEquals("confirm", TvKeyMapper.actionFor(KeyEvent.KEYCODE_DPAD_CENTER))
        assertEquals("confirm", TvKeyMapper.actionFor(KeyEvent.KEYCODE_BUTTON_A))
        assertEquals("back", TvKeyMapper.actionFor(KeyEvent.KEYCODE_BACK))
        assertEquals("back", TvKeyMapper.actionFor(KeyEvent.KEYCODE_BUTTON_B))
        assertEquals("start", TvKeyMapper.actionFor(KeyEvent.KEYCODE_BUTTON_START))
        assertEquals("start", TvKeyMapper.actionFor(KeyEvent.KEYCODE_MEDIA_PLAY_PAUSE))
    }

    @Test
    fun ignoresUnsupportedKeys() {
        assertNull(TvKeyMapper.actionFor(KeyEvent.KEYCODE_DPAD_LEFT))
        assertNull(TvKeyMapper.actionFor(KeyEvent.KEYCODE_DPAD_RIGHT))
        assertNull(TvKeyMapper.actionFor(KeyEvent.KEYCODE_VOLUME_UP))
        assertNull(TvKeyMapper.actionFor(KeyEvent.KEYCODE_VOLUME_DOWN))
        assertNull(TvKeyMapper.actionFor(KeyEvent.KEYCODE_MENU))
    }
}
