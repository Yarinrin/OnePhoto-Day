package com.yarinrin.onephotoday;

import android.os.Bundle;
import android.view.View;

import androidx.core.graphics.Insets;
import androidx.core.view.ViewCompat;
import androidx.core.view.WindowInsetsCompat;

import com.getcapacitor.BridgeActivity;

/**
 * Keeps the web content out from under the system bars.
 *
 * Android 15 lays every app out edge to edge whether it asks to or not, so the
 * WebView fills the whole screen — including the strip the gesture bar sits on.
 * On the web the fix would be `env(safe-area-inset-bottom)`, but Android's
 * WebView never populates those values: they read as zero, so the bottom
 * navigation was drawn a few pixels above the very bottom of the display,
 * directly beneath the gesture bar. It looked right and was completely dead,
 * because the system claims touches in that strip before the app sees them.
 *
 * So the insets are read where they are actually known — here — and applied as
 * padding on the content view. Everything inside is then laid out in the space
 * the user can actually touch. The window background shows through the padded
 * strips, which is why it is set to the app's cream in styles.xml rather than
 * left the default: the bars still look like part of the app.
 */
public class MainActivity extends BridgeActivity {

    @Override
    public void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);

        View content = findViewById(android.R.id.content);
        ViewCompat.setOnApplyWindowInsetsListener(content, (view, windowInsets) -> {
            Insets bars = windowInsets.getInsets(
                WindowInsetsCompat.Type.systemBars() | WindowInsetsCompat.Type.displayCutout()
            );
            view.setPadding(bars.left, bars.top, bars.right, bars.bottom);
            return WindowInsetsCompat.CONSUMED;
        });
    }
}
