// ============================================================
// SMART REMINDER - SERVICE WORKER
// Handles notification clicks and notification action buttons.
// ============================================================

self.addEventListener("install", function () {
    self.skipWaiting();
});

self.addEventListener("activate", function (event) {
    event.waitUntil(self.clients.claim());
});


// ============================================================
// NOTIFICATION CLICK / ACTIONS
// ============================================================

self.addEventListener("notificationclick", function (event) {

    const notification = event.notification;
    const action = event.action || "open";

    const data = notification.data || {};
    const taskId = data.taskId || null;

    notification.close();

    event.waitUntil(

        self.clients.matchAll({
            type: "window",
            includeUncontrolled: true
        })

        .then(function (clientList) {

            // Send the action to an already-open Smart Reminder tab
            for (const client of clientList) {

                if (
                    client.url.includes("smartreminder") ||
                    client.url.includes("onrender.com")
                ) {

                    client.postMessage({
                        type: "REMINDER_ACTION",
                        action: action,
                        taskId: taskId
                    });

                    if ("focus" in client) {
                        return client.focus();
                    }
                }
            }

            // If the website isn't open, open it
            if (self.clients.openWindow) {
                return self.clients.openWindow("/");
            }

            return undefined;
        })
    );
});


// ============================================================
// NOTIFICATION CLOSE
// ============================================================

self.addEventListener("notificationclose", function (event) {
    // Notification was dismissed.
});