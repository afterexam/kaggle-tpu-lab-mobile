package com.kaggletpulab.app;

import android.content.Intent;
import android.net.Uri;
import android.os.PowerManager;
import android.content.Context;
import android.provider.Settings;

import androidx.core.content.ContextCompat;

import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

/**
 * Local Capacitor plugin bridging the web UI to {@link QueueMonitorService}.
 *
 * <p>Registered manually in MainActivity (local plugin, not an npm package).
 */
@CapacitorPlugin(name = "QueueMonitor")
public class QueueMonitorPlugin extends Plugin {

    @PluginMethod
    public void startMonitoring(PluginCall call) {
        String topic = call.getString("topic");
        if (topic == null || !topic.matches("[A-Za-z0-9_-]{1,64}")) {
            call.reject("Invalid topic");
            return;
        }
        Intent i = new Intent(getContext(), QueueMonitorService.class);
        i.setAction(QueueMonitorService.ACTION_ADD);
        i.putExtra(QueueMonitorService.EXTRA_TOPIC, topic);
        ContextCompat.startForegroundService(getContext(), i);
        call.resolve();
    }

    @PluginMethod
    public void stopMonitoring(PluginCall call) {
        String topic = call.getString("topic"); // optional; absent => stop all
        Intent i = new Intent(getContext(), QueueMonitorService.class);
        if (topic != null && !topic.isEmpty()) {
            i.setAction(QueueMonitorService.ACTION_REMOVE);
            i.putExtra(QueueMonitorService.EXTRA_TOPIC, topic);
        } else {
            i.setAction(QueueMonitorService.ACTION_STOP_ALL);
        }
        getContext().startService(i);
        call.resolve();
    }

    @PluginMethod
    public void isIgnoringBatteryOptimizations(PluginCall call) {
        PowerManager pm = (PowerManager) getContext().getSystemService(Context.POWER_SERVICE);
        JSObject ret = new JSObject();
        ret.put("ignoring", pm != null
                && pm.isIgnoringBatteryOptimizations(getContext().getPackageName()));
        call.resolve(ret);
    }

    /**
     * Opens the system dialog asking the user to exempt the app from battery
     * optimizations. Without this, Doze suspends the SSE stream's network
     * access and background monitoring cannot work reliably.
     */
    @PluginMethod
    public void requestBatteryOptimizationExemption(PluginCall call) {
        try {
            Intent i = new Intent(Settings.ACTION_REQUEST_IGNORE_BATTERY_OPTIMIZATIONS);
            i.setData(Uri.parse("package:" + getContext().getPackageName()));
            i.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
            getContext().startActivity(i);
            call.resolve();
        } catch (Exception e) {
            call.reject("Cannot open battery settings: " + e.getMessage());
        }
    }
}
