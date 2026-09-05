// ==========================================
// SMART REMINDER - FRONTEND
// ==========================================

let tasks = [];
let currentView = "dashboard";

 const API = "https://smartreminder-zllc.onrender.com";

 // ============================================================
// WEB PUSH - MULTI DEVICE SUBSCRIPTION
// ============================================================

const VAPID_PUBLIC_KEY =
    "BLTO-IymxVT8Q9I7-Xr9Dq9BT2QZs82P5Iza787_EkHCI-ykqITHuJ2-nxWT1_LoHHG-un-nwU72TbXdV1R2BUg";

function urlBase64ToUint8Array(base64String) {
    const padding = "=".repeat(
        (4 - (base64String.length % 4)) % 4
    );

    const base64 = (
        base64String +
        padding
    )
        .replace(/-/g, "+")
        .replace(/_/g, "/");

    const rawData = window.atob(base64);

    return Uint8Array.from(
        [...rawData].map(char => char.charCodeAt(0))
    );
}

async function registerWebPushSubscription() {

    const username = getLoggedInUser();

    if (!username) {
        console.log(
            "Web Push: no logged-in user."
        );
        return false;
    }

    if (
        !("serviceWorker" in navigator) ||
        !("PushManager" in window)
    ) {
        console.log(
            "Web Push is not supported on this device."
        );
        return false;
    }

    if (
        !("Notification" in window) ||
        Notification.permission !== "granted"
    ) {
        console.log(
            "Web Push: notification permission not granted."
        );
        return false;
    }

    try {

        const registration =
            serviceWorkerRegistration ||
            await registerNotificationServiceWorker();

        if (!registration) {
            console.error(
                "Web Push: service worker unavailable."
            );
            return false;
        }

        let subscription =
            await registration.pushManager.getSubscription();

        if (!subscription) {

            subscription =
                await registration.pushManager.subscribe({
                    userVisibleOnly: true,
                    applicationServerKey:
                        urlBase64ToUint8Array(
                            VAPID_PUBLIC_KEY
                        )
                });
        }

        const subscriptionJSON =
            subscription.toJSON();

        const response = await fetch(
            `${API}/push/subscribe`,
            {
                method: "POST",
                headers: {
                    "Content-Type":
                        "application/x-www-form-urlencoded"
                },
                body: new URLSearchParams({
                    username: username,
                    endpoint:
                        subscriptionJSON.endpoint || "",
                    p256dh:
                        subscriptionJSON.keys?.p256dh || "",
                    auth:
                        subscriptionJSON.keys?.auth || ""
                })
            }
        );

        const result =
            await response.json();

        if (!response.ok || !result.success) {
            console.error(
                "Web Push subscription failed:",
                result
            );
            return false;
        }

        console.log(
            "Web Push subscription registered for:",
            username
        );

        return true;

    } catch (error) {

        console.error(
            "Web Push registration error:",
            error
        );

        return false;
    }
}
const AUTH_KEY = "smartReminderUser";

// Set to true right before a fresh signup so the header can say
// "Welcome" instead of "Welcome back" just this once.
let justSignedUp = false;

// Daily Schedule data, kept completely separate from `tasks`
// (reminders). Every schedule item belongs to a day of the week.
let scheduleData = [];
let activeScheduleDay = "mon";

const ALL_DAYS = ["mon", "tue", "wed", "thu", "fri", "sat", "sun"];

const DAY_LABELS = {
    mon: "Monday",
    tue: "Tuesday",
    wed: "Wednesday",
    thu: "Thursday",
    fri: "Friday",
    sat: "Saturday",
    sun: "Sunday"
};

const DAY_TO_JS_INDEX = {
    sun: 0, mon: 1, tue: 2, wed: 3, thu: 4, fri: 5, sat: 6
};


// ==========================================
// INITIALIZE
// ==========================================

document.addEventListener("DOMContentLoaded", async () => {

    const loggedInUser = getLoggedInUser();

    if (loggedInUser) {

        showAppScreen(loggedInUser);

        await loadTasks();

        await initializeDeviceNotifications();

        showDashboard();

    }
    else {

        showAuthScreen();

        showLogin();
    }

    // Close modal when clicking outside it
    window.addEventListener("click", function (event) {

        const modal = document.getElementById("taskModal");
        const usernameModal = document.getElementById("usernameModal");
        const passwordModal = document.getElementById("passwordModal");
        const securityModal = document.getElementById("securityModal");
        const scheduleModal = document.getElementById("scheduleModal");
        const scheduleWeekModal = document.getElementById("scheduleWeekModal");
        const scheduleEditDayModal = document.getElementById("scheduleEditDayModal");
        const scheduleReminderModal = document.getElementById("scheduleReminderModal");
        const aiKeyModal = document.getElementById("aiKeyModal");

        if (event.target === modal) {
            closeAddTask();
        }

        if (event.target === usernameModal) {
            closeChangeUsername();
        }

        if (event.target === passwordModal) {
            closeChangePassword();
        }

        if (event.target === securityModal) {
            closeChangeSecurity();
        }

        if (event.target === scheduleModal) {
            closeDailySchedule();
        }

        if (event.target === scheduleWeekModal) {
            closeScheduleWeekView();
        }

        if (event.target === scheduleEditDayModal) {
            closeEditDay();
        }

        if (event.target === scheduleReminderModal) {
            closeReminderFromSchedule();
        }

        if (event.target === aiKeyModal) {
            closeAiKeySetup();
        }
    });

    // Close profile dropdown when clicking outside it
    document.addEventListener("click", function (event) {

        const menu = document.querySelector(".profile-menu");

        if (menu && !menu.contains(event.target)) {
            closeProfileMenu();
        }
    });
});


// ==========================================
// LOAD TASKS FROM C++ SERVER
// ==========================================

async function loadTasks() {

    try {

        const username = getLoggedInUser() || "";

        const response = await fetch(
            `${API}/tasks?username=${encodeURIComponent(username)}`
        );

        if (!response.ok) {
            throw new Error(`HTTP ${response.status}`);
        }

        const data = await response.json();

        if (Array.isArray(data)) {
            tasks = data;
        }
        else if (data.tasks && Array.isArray(data.tasks)) {
            tasks = data.tasks;
        }
        else {
            tasks = [];
        }

        normalizeTasks();

        updateStatistics();
        updateNextTask();

    }
    catch (error) {

        console.error("Could not load tasks:", error);

        tasks = [];

        updateStatistics();
        updateNextTask();
    }
}


// ==========================================
// NORMALIZE TASK DATA
// ==========================================

function normalizeTasks() {

    tasks = tasks.map(task => {

        const priorityNumber =
            Number(
                task.priority ??
                task.priorityText ??
                1
            );

        const status =
            String(task.status || "").toLowerCase();

        const completed =
            task.completed === true ||
            status === "completed";

        return {
            ...task,

            id:
                task.id ??
                task.taskId ??
                task.ID,

            name:
                task.name ||
                task.title ||
                "Untitled Task",

            date:
                task.date || "",

            time:
                task.time || "",

            priority:
                isNaN(priorityNumber)
                    ? 1
                    : priorityNumber,

            completed:
                completed
        };
    });
}


// ==========================================
// VIEW / NAVIGATION
// ==========================================

function showView(view) {

    currentView = view;

    // Remove active from every sidebar button
    document.querySelectorAll("nav button").forEach(button => {
        button.classList.remove("active");
    });

    // Activate correct sidebar button
    const activeButton =
        document.querySelector(
            `nav button[data-view="${view}"]`
        );

    if (activeButton) {
        activeButton.classList.add("active");
    }

    const stats =
        document.querySelector(".stats");

    const important =
        document.querySelector(".important");

    const upcoming =
        document.querySelector(".upcoming");

    const upcomingTitle =
        document.querySelector(
            ".upcoming .section-title h2"
        );

    const addButton =
        document.querySelector(
            ".upcoming .section-title button"
        );


    // ======================================
    // DASHBOARD
    // ======================================

    if (view === "dashboard") {

        stats.style.display = "grid";

        important.style.display = "block";

        upcoming.style.display = "block";

        upcomingTitle.textContent =
            "Upcoming Reminders";

        addButton.style.display =
            "inline-block";

        updateStatistics();

        updateNextTask();

        renderTaskList(
            tasks.filter(task => !task.completed)
        );

        return;
    }


    // ======================================
    // OTHER PAGES
    // ======================================

    stats.style.display = "none";

    important.style.display = "none";

    upcoming.style.display = "block";

    addButton.style.display = "inline-block";


    // ======================================
    // ALL TASKS
    // ======================================

    if (view === "all") {

        upcomingTitle.textContent =
            "All Tasks";

        renderTaskList(tasks);

        return;
    }


    // ======================================
    // CALENDAR
    // ======================================

    if (view === "calendar") {

        upcomingTitle.textContent =
            "Calendar";

        renderCalendar();

        return;
    }


    // ======================================
    // COMPLETED
    // ======================================

    if (view === "completed") {

        upcomingTitle.textContent =
            "Completed Tasks";

        renderTaskList(
            tasks.filter(task => task.completed)
        );

        return;
    }
}


// ==========================================
// SIDEBAR FUNCTIONS
// ==========================================

function showDashboard() {

    showView("dashboard");
}


function showAllTasks() {

    showView("all");
}


function showCalendar() {

    showView("calendar");
}


function showCompleted() {

    showView("completed");
}


// ==========================================
// NOTIFICATION
// ==========================================

function showNotifications() {

    if (!("Notification" in window)) {
        alert(
            "Your browser does not support device notifications."
        );
        return;
    }

    if (Notification.permission !== "granted") {
        requestDeviceNotifications();
        return;
    }

    const pending =
        tasks.filter(task => !task.completed);

    if (pending.length === 0) {
        alert("🔔 No pending reminders.");
        return;
    }

    const upcoming = [...pending]
        .filter(task => parseTaskDateTime(task))
        .sort((a, b) => {
            return parseTaskDateTime(a).getTime()
                - parseTaskDateTime(b).getTime();
        })
        .slice(0, 5);

    let message = "🔔 Notifications are ON.\n\n";

    if (upcoming.length === 0) {
        message += "No scheduled reminders.";
    }
    else {
        message += "Upcoming reminders:\n\n";

        upcoming.forEach((task, index) => {
            message +=
                `${index + 1}. ${task.name}\n` +
                `${task.date} • ${task.time}\n\n`;
        });
    }

    alert(message);
}



// ==========================================
// DEVICE NOTIFICATIONS
// ==========================================
//
// This uses the browser Notifications API plus a Service Worker.
// The page checks reminders periodically while SmartReminder is
// open/in the background. A Service Worker handles the notification
// display and click action.
//
// Important: a normal browser page cannot reliably wake a completely
// closed website by itself. True "closed browser" push requires a
// push provider/VAPID setup. This implementation therefore gives
// reliable device notifications while the site is running, and on
// browsers that keep the page/service worker alive in the background.

const NOTIFICATION_SEEN_KEY = "smartReminderNotificationSeen";
const NOTIFICATION_POLL_MS = 15000;
let notificationPollTimer = null;
let serviceWorkerRegistration = null;

async function registerNotificationServiceWorker() {
    if (!("serviceWorker" in navigator)) {
        updateNotificationStatus();
        return null;
    }

    try {
        serviceWorkerRegistration =
            await navigator.serviceWorker.register("/service-worker.js");

        await navigator.serviceWorker.ready;

        return serviceWorkerRegistration;
    }
    catch (error) {
        console.error("Service worker registration failed:", error);
        return null;
    }
}

function getNotificationSeen() {
    try {
        const raw = localStorage.getItem(NOTIFICATION_SEEN_KEY);
        const data = raw ? JSON.parse(raw) : {};

        if (!data || typeof data !== "object") {
            return {};
        }

        return data;
    }
    catch (error) {
        return {};
    }
}

function saveNotificationSeen(data) {
    try {
        localStorage.setItem(
            NOTIFICATION_SEEN_KEY,
            JSON.stringify(data)
        );
    }
    catch (error) {
        console.warn("Could not save notification state:", error);
    }
}

function taskNotificationKey(task) {
    return [
        getLoggedInUser() || "",
        String(task.id),
        task.date || "",
        task.time || ""
    ].join("|");
}

function parseTaskDateTime(task) {
    if (!task || !task.date || !task.time) {
        return null;
    }

    const date = new Date(`${task.date}T${task.time}`);

    if (Number.isNaN(date.getTime())) {
        return null;
    }

    return date;
}

function updateNotificationStatus() {
    const status = document.getElementById("notificationStatus");
    const button = document.getElementById("notificationButton");

    if (!status) {
        return;
    }

    status.classList.remove("enabled", "disabled", "blocked");

    if (!("Notification" in window)) {
        status.textContent = "Device notifications are not supported by this browser.";
        status.classList.add("blocked");

        if (button) {
            button.title = "Notifications are not supported";
        }

        return;
    }

    if (Notification.permission === "granted") {
        status.textContent = "🔔 Device notifications are ON";
        status.classList.add("enabled");

        if (button) {
            button.classList.add("notification-enabled");
            button.title = "Notifications are enabled";
        }

        return;
    }

    if (Notification.permission === "denied") {
        status.textContent = "🔕 Notifications are blocked. Allow them in browser settings.";
        status.classList.add("blocked");

        if (button) {
            button.classList.remove("notification-enabled");
            button.title = "Notifications are blocked";
        }

        return;
    }

    status.textContent = "🔔 Click the bell to enable device notifications.";
    status.classList.add("disabled");

    if (button) {
        button.classList.remove("notification-enabled");
        button.title = "Enable device notifications";
    }
}

async function requestDeviceNotifications() {
    if (!("Notification" in window)) {
        alert("This browser does not support device notifications.");
        updateNotificationStatus();
        return false;
    }

    if (Notification.permission === "denied") {
        alert(
            "Notifications are blocked for Smart Reminder.\n\n" +
            "Open your browser/site settings and allow Notifications, " +
            "then reload the site."
        );

        updateNotificationStatus();
        return false;
    }

    let permission = Notification.permission;

    if (permission === "default") {
        permission = await Notification.requestPermission();
    }

    updateNotificationStatus();

    if (permission !== "granted") {
        return false;
    }

    await registerNotificationServiceWorker();

    await registerWebPushSubscription();
    // A small test notification confirms that permission really works.
    await showDeviceNotification(
        "Smart Reminder",
        "Device notifications are enabled. You won't miss your reminders.",
        "smart-reminder-test"
    );

    return true;
}

async function showDeviceNotification(title, body, tag, taskId) {
    if (!("Notification" in window) ||
        Notification.permission !== "granted") {
        return false;
    }

   const options = {
    body: body,
    tag: tag || "smart-reminder",
    requireInteraction: true,

    actions: [
        {
            action: "complete",
            title: "✓ Complete"
        },
        {
            action: "snooze",
            title: "😴 Snooze 15 min"
        }
    ],

    data: {
        url: window.location.origin + "/",
        taskId: taskId || null
    }
};

    try {
        if (serviceWorkerRegistration) {
            await serviceWorkerRegistration.showNotification(
                title,
                options
            );

            return true;
        }

        const registration =
            await registerNotificationServiceWorker();

        if (registration) {
            await registration.showNotification(
                title,
                options
            );

            return true;
        }

        // Fallback for browsers where the service worker is unavailable.
        new Notification(title, options);
        return true;
    }
    catch (error) {
        console.error("Could not show notification:", error);

        try {
            new Notification(title, options);
            return true;
        }
        catch (fallbackError) {
            console.error(
                "Notification fallback failed:",
                fallbackError
            );
            return false;
        }
    }
}

async function checkDueReminders() {
    const username = getLoggedInUser();

    if (!username || !Array.isArray(tasks)) {
        return;
    }

    if (!("Notification" in window) ||
        Notification.permission !== "granted") {
        return;
    }

    const now = Date.now();
    const seen = getNotificationSeen();
    let changed = false;

    // Only notify for reminders that became due within the last
    // 2 minutes. This prevents old reminders from firing immediately
    // when a user logs in days later.
    const gracePeriodMs = 2 * 60 * 1000;

    for (const task of tasks) {
        if (!task || task.completed) {
            continue;
        }

        const due = parseTaskDateTime(task);

        if (!due) {
            continue;
        }

        const dueTime = due.getTime();

        if (dueTime > now) {
            continue;
        }

        if (now - dueTime > gracePeriodMs) {
            continue;
        }

        const key = taskNotificationKey(task);

        if (seen[key]) {
            continue;
        }

        const priorityName =
            typeof getPriorityName === "function"
                ? getPriorityName(task.priority)
                : "Reminder";

        const shown = await showDeviceNotification(
    "⏰ Smart Reminder",
    `${task.name}\n${task.date} • ${task.time}\nPriority: ${priorityName}`,
    `smart-reminder-${task.id}-${task.date}-${task.time}`,
    task.id
);

        if (shown) {
            seen[key] = Date.now();
            changed = true;
        }
    }

    // Keep this small so localStorage does not grow forever.
    const cutoff = now - (30 * 24 * 60 * 60 * 1000);

    for (const key of Object.keys(seen)) {
        if (typeof seen[key] === "number" && seen[key] < cutoff) {
            delete seen[key];
            changed = true;
        }
    }

    if (changed) {
        saveNotificationSeen(seen);
    }
}

function startNotificationChecker() {
    if (notificationPollTimer) {
        clearInterval(notificationPollTimer);
    }

    checkDueReminders();

    notificationPollTimer = setInterval(
        async function () {
            if (getLoggedInUser()) {
                await checkDueReminders();
            }
        },
        NOTIFICATION_POLL_MS
    );
}

function stopNotificationChecker() {
    if (notificationPollTimer) {
        clearInterval(notificationPollTimer);
        notificationPollTimer = null;
    }
}

async function initializeDeviceNotifications() {
    updateNotificationStatus();

    // Registering a service worker does NOT ask for permission.
    await registerNotificationServiceWorker();

    startNotificationChecker();
}



// ==========================================
// ADD REMINDER MODAL
// ==========================================

function openAddTask() {

    const modal =
        document.getElementById("taskModal");

    if (modal) {

        modal.style.display = "flex";
    }
}


function closeAddTask() {

    const modal =
        document.getElementById("taskModal");

    if (modal) {

        modal.style.display = "none";
    }
}


// ==========================================
// ADD NEW TASK
// ==========================================

async function addTask() {

    const name =
        document
            .getElementById("taskName")
            .value
            .trim();

    const date =
        document
            .getElementById("taskDate")
            .value;

    const time =
        document
            .getElementById("taskTime")
            .value;

    const priority =
        Number(
            document
                .getElementById("taskPriority")
                .value
        );


    // Validate
    if (
        name === "" ||
        date === "" ||
        time === ""
    ) {

        alert("Please fill all fields.");

        return;
    }


    try {

        const response =
            await fetch(`${API}/add`, {

                method: "POST",

                headers: {
                    "Content-Type":
                        "application/x-www-form-urlencoded"
                },

                body:
                    new URLSearchParams({

                        username:
                            getLoggedInUser() || "",

                        name: name,

                        date: date,

                        time: time,

                        priority:
                            String(priority)
                    })
            });


        if (!response.ok) {

            throw new Error(
                `HTTP ${response.status}`
            );
        }


        const result =
            await response.json();


        if (!result.success) {

            alert(
                "C++ server could not add the reminder."
            );

            return;
        }


        // Add task locally
        tasks.push({

            id: result.id,

            name: name,

            date: date,

            time: time,

            priority: priority,

            completed: false
        });


        // Clear form
        clearTaskForm();


        // Close modal
        closeAddTask();


        // Update everything
        normalizeTasks();

        updateStatistics();

        updateNextTask();

        showView(currentView);

    }
    catch (error) {

        console.error(
            "Backend connection error:",
            error
        );


        alert(
            "Could not connect to C++ server.\n\n" +

            "Make sure SmartReminderServer is running on " +

            "127.0.0.1:8080."
        );
    }
}


// ==========================================
// CLEAR FORM
// ==========================================

function clearTaskForm() {

    document.getElementById(
        "taskName"
    ).value = "";


    document.getElementById(
        "taskDate"
    ).value = "";


    document.getElementById(
        "taskTime"
    ).value = "";


    document.getElementById(
        "taskPriority"
    ).value = "1";
}


// ==========================================
// TASK LIST
// ==========================================

function renderTaskList(list) {

    const container =
        document.getElementById("taskList");


    if (!container) {
        return;
    }


    container.innerHTML = "";


    if (list.length === 0) {

        container.innerHTML =
            '<p class="empty">No reminders found.</p>';

        return;
    }


    list.forEach(task => {

        const card =
            document.createElement("div");

        card.className = "task";


        // ==================================
        // TASK INFO
        // ==================================

        const info =
            document.createElement("div");


        const name =
            document.createElement("strong");

        name.textContent =
            task.name;


        const details =
            document.createElement("p");

        details.textContent =
            `${task.date} • ${task.time}`;


        info.appendChild(name);

        info.appendChild(details);


        // ==================================
        // ACTIONS
        // ==================================

        const actions =
            document.createElement("div");


        actions.style.display =
            "flex";

        actions.style.alignItems =
            "center";

        actions.style.gap =
            "12px";


        // ==================================
        // PRIORITY
        // ==================================

        const priority =
            document.createElement("span");


        priority.textContent =
            `Priority: ${getPriorityName(
                task.priority
            )}`;


        actions.appendChild(priority);


        // ==================================
        // COMPLETE BUTTON
        // ==================================

        if (!task.completed) {

            const completeButton =
                document.createElement("button");


            completeButton.textContent =
                "✓ Complete";


            completeButton.style.cursor =
                "pointer";


            completeButton.style.padding =
                "8px 10px";


            completeButton.style.border =
                "none";


            completeButton.style.borderRadius =
                "6px";


            completeButton.onclick =
                function () {

                    completeTask(task.id);
                };


            actions.appendChild(
                completeButton
            );

        }
        else {

            const completedText =
                document.createElement("span");


            completedText.textContent =
                "✓ Completed";


            actions.appendChild(
                completedText
            );
        }


        // ==================================
        // ADD TO CARD
        // ==================================

        card.appendChild(info);

        card.appendChild(actions);


        container.appendChild(card);
    });
}


// ==========================================
// COMPLETE TASK
// ==========================================

async function completeTask(id) {

    const task =
        tasks.find(
            item =>
                String(item.id) === String(id)
        );


    if (!task) {

        alert("Task ID was not found.");

        return;
    }


    try {

        const response =
            await fetch(
                `${API}/complete?id=${encodeURIComponent(id)}` +
                `&username=${encodeURIComponent(getLoggedInUser() || "")}`,
                {
                    method: "POST"
                }
            );


        if (!response.ok) {

            throw new Error(
                `HTTP ${response.status}`
            );
        }


        // Update locally
        task.completed = true;

        task.status = "completed";


        updateStatistics();

        updateNextTask();

        showView(currentView);


        // Refresh from backend
        await loadTasks();

        showView(currentView);

    }
    catch (error) {

        console.error(
            "Complete task error:",
            error
        );


        alert(
            "Could not connect to C++ server."
        );
    }
}


// ==========================================
// STATISTICS
// ==========================================

function updateStatistics() {

    const total =
        tasks.length;


    const completed =
        tasks.filter(
            task => task.completed
        ).length;


    const pending =
        total - completed;


    const totalElement =
        document.getElementById(
            "totalTasks"
        );


    const pendingElement =
        document.getElementById(
            "pendingTasks"
        );


    const completedElement =
        document.getElementById(
            "completedTasks"
        );


    if (totalElement) {

        totalElement.textContent =
            total;
    }


    if (pendingElement) {

        pendingElement.textContent =
            pending;
    }


    if (completedElement) {

        completedElement.textContent =
            completed;
    }
}


// ==========================================
// NEXT IMPORTANT REMINDER
// ==========================================

function updateNextTask() {

    const pending =
        tasks.filter(
            task => !task.completed
        );


    const nextTaskElement =
        document.getElementById(
            "nextTask"
        );


    const nextTimeElement =
        document.getElementById(
            "nextTime"
        );


    if (!nextTaskElement ||
        !nextTimeElement) {

        return;
    }


    if (pending.length === 0) {

        nextTaskElement.textContent =
            "No reminders";


        nextTimeElement.textContent =
            "Add a reminder to get started.";

        return;
    }


    // Highest priority first
    const importantTask =
        [...pending].sort((a, b) => {

            if (b.priority !== a.priority) {

                return b.priority -
                    a.priority;
            }


            return (
                `${a.date} ${a.time}`
            ).localeCompare(
                `${b.date} ${b.time}`
            );

        })[0];


    nextTaskElement.textContent =
        importantTask.name;


    nextTimeElement.textContent =
        `${importantTask.date} • ${importantTask.time}`;
}


// ==========================================
// CALENDAR
// ==========================================

function renderCalendar() {

    const container =
        document.getElementById(
            "taskList"
        );


    if (!container) {
        return;
    }


    container.innerHTML = "";


    if (tasks.length === 0) {

        container.innerHTML =
            '<p class="empty">No reminders to show on the calendar.</p>';

        return;
    }


    // Group by date
    const grouped = {};


    [...tasks]
        .sort((a, b) => {

            return (
                `${a.date} ${a.time}`
            ).localeCompare(
                `${b.date} ${b.time}`
            );

        })
        .forEach(task => {

            if (!grouped[task.date]) {

                grouped[task.date] = [];
            }


            grouped[task.date].push(task);
        });


    Object.keys(grouped)
        .sort()
        .forEach(date => {

            const day =
                document.createElement("div");


            day.className =
                "task";


            day.style.display =
                "block";


            // Date heading
            const heading =
                document.createElement(
                    "strong"
                );


            heading.textContent =
                date;


            heading.style.fontSize =
                "20px";


            day.appendChild(
                heading
            );


            // Tasks for this date
            grouped[date].forEach(task => {

                const row =
                    document.createElement("p");


                row.style.marginTop =
                    "10px";


                row.textContent =
                    `${task.time} — ` +
                    `${task.name} — ` +
                    `${getPriorityName(
                        task.priority
                    )}` +
                    (
                        task.completed
                            ? " — ✓ Completed"
                            : ""
                    );


                day.appendChild(row);
            });


            container.appendChild(day);
        });
}


// ==========================================
// PRIORITY
// ==========================================

function getPriorityName(priority) {

    const number =
        Number(priority);


    if (number === 4) {

        return "CRITICAL";
    }


    if (number === 3) {

        return "HIGH";
    }


    if (number === 2) {

        return "MEDIUM";
    }


    return "LOW";
}

/* =========================================================
   DAY / NIGHT THEME
   ========================================================= */

function applyTheme() {
    const savedTheme = localStorage.getItem("smartReminderTheme");

    if (savedTheme === "dark") {
        document.body.classList.add("dark-theme");

        const button = document.getElementById("themeToggle");
        if (button) {
            button.textContent = "☀️";
        }
    } else {
        document.body.classList.remove("dark-theme");

        const button = document.getElementById("themeToggle");
        if (button) {
            button.textContent = "🌙";
        }
    }
}


function toggleTheme() {
    const isDark = document.body.classList.toggle("dark-theme");

    localStorage.setItem(
        "smartReminderTheme",
        isDark ? "dark" : "light"
    );

    const button = document.getElementById("themeToggle");

    if (button) {
        button.textContent = isDark ? "☀️" : "🌙";
    }
}


/* Apply saved theme when page opens */
document.addEventListener("DOMContentLoaded", function () {
    applyTheme();
    updateNotificationStatus();
});


/* =========================================================
   AUTH - SESSION HELPERS
   ========================================================= */

function getLoggedInUser() {

    return localStorage.getItem(AUTH_KEY);
}


function showAuthScreen() {

    document.getElementById("authScreen").style.display = "flex";

    document.getElementById("appScreen").style.display = "none";
}


function showAppScreen(username) {

    document.getElementById("authScreen").style.display = "none";

    document.getElementById("appScreen").style.display = "flex";

    // Sidebar shows only the logo once logged in, no text
    const sidebarTitle =
        document.getElementById("sidebarTitle");

    if (sidebarTitle) {
        sidebarTitle.style.display = "none";
    }

    updateProfileDisplay(username);

    updateGreeting(username);
}


function updateGreeting(username) {

    const greetingEl =
        document.getElementById("headerGreeting");

    if (!greetingEl) {
        return;
    }

    greetingEl.textContent =
        justSignedUp
            ? `Welcome, ${username} 👋`
            : `Welcome back, ${username} 👋`;

    justSignedUp = false;
}


function updateProfileDisplay(username) {

    const label =
        document.getElementById("profileUsernameLabel");

    const initial =
        document.getElementById("profileInitial");

    if (label) {
        label.textContent = username;
    }

    if (initial && username) {
        initial.textContent =
            username.charAt(0).toUpperCase();
    }
}


function showLogin() {

    document.getElementById("loginForm").style.display = "block";

    document.getElementById("signupForm").style.display = "none";

    document.getElementById("forgotForm").style.display = "none";

    document.getElementById("loginError").textContent = "";
}


function showSignup() {

    document.getElementById("loginForm").style.display = "none";

    document.getElementById("signupForm").style.display = "block";

    document.getElementById("forgotForm").style.display = "none";

    document.getElementById("signupError").textContent = "";
}


/* =========================================================
   AUTH - FORGOT PASSWORD
   ========================================================= */

function openForgotPassword() {

    document.getElementById("loginForm").style.display = "none";

    document.getElementById("signupForm").style.display = "none";

    document.getElementById("forgotForm").style.display = "block";

    document.getElementById("forgotError").textContent = "";
}


async function submitForgotPassword() {

    const username =
        document.getElementById("forgotUsername").value.trim();

    const favColor =
        document.getElementById("forgotFavColor").value;

    const favFruit =
        document.getElementById("forgotFavFruit").value;

    const newPassword =
        document.getElementById("forgotNewPassword").value;

    const errorEl =
        document.getElementById("forgotError");

    errorEl.textContent = "";


    if (!username || !favColor || !favFruit || !newPassword) {

        errorEl.textContent =
            "Please fill all fields.";

        return;
    }

    if (newPassword.length < 6) {

        errorEl.textContent =
            "New password must be at least 6 characters.";

        return;
    }


    try {

        const response =
            await fetch(`${API}/forgot-reset`, {

                method: "POST",

                headers: {
                    "Content-Type":
                        "application/x-www-form-urlencoded"
                },

                body:
                    new URLSearchParams({
                        username: username,
                        favColor: favColor,
                        favFruit: favFruit,
                        newPassword: newPassword
                    })
            });

        const result =
            await response.json();

        if (!result.success) {

            errorEl.textContent =
                result.message || "Could not reset password.";

            return;
        }

        alert("Password reset. You can log in now.");

        document.getElementById("forgotUsername").value = "";
        document.getElementById("forgotFavColor").value = "";
        document.getElementById("forgotFavFruit").value = "";
        document.getElementById("forgotNewPassword").value = "";

        showLogin();

    }
    catch (error) {

        console.error("Forgot password error:", error);

        errorEl.textContent =
            "Could not connect to the server.";
    }
}


/* =========================================================
   AUTH - LOGIN
   ========================================================= */

async function loginUser() {

    const username =
        document.getElementById("loginUsername").value.trim();

    const password =
        document.getElementById("loginPassword").value;

    const errorEl =
        document.getElementById("loginError");

    errorEl.textContent = "";


    if (!username || !password) {

        errorEl.textContent =
            "Please enter your username and password.";

        return;
    }


    try {

        const response =
            await fetch(`${API}/login`, {

                method: "POST",

                headers: {
                    "Content-Type":
                        "application/x-www-form-urlencoded"
                },

                body:
                    new URLSearchParams({
                        username: username,
                        password: password
                    })
            });

        const result =
            await response.json();

        if (!result.success) {

            errorEl.textContent =
                result.message || "Could not log in.";

            return;
        }

        localStorage.setItem(AUTH_KEY, result.username);

        document.getElementById("loginPassword").value = "";

        showAppScreen(result.username);

        await loadTasks();

        await initializeDeviceNotifications();

        showDashboard();

    }
    catch (error) {

        console.error("Login error:", error);

        errorEl.textContent =
            "Could not connect to the server.";
    }
}


/* =========================================================
   AUTH - SIGNUP
   ========================================================= */

async function signupUser() {

    const username =
        document.getElementById("signupUsername").value.trim();

    const password =
        document.getElementById("signupPassword").value;

    const confirmPassword =
        document.getElementById("signupConfirmPassword").value;

    const favColor =
        document.getElementById("signupFavColor").value;

    const favFruit =
        document.getElementById("signupFavFruit").value;

    const errorEl =
        document.getElementById("signupError");

    errorEl.textContent = "";


    if (!username || !password || !confirmPassword) {

        errorEl.textContent =
            "Please fill all fields.";

        return;
    }

    if (!favColor || !favFruit) {

        errorEl.textContent =
            "Please select your favourite colour and fruit.";

        return;
    }

    if (password.length < 6) {

        errorEl.textContent =
            "Password must be at least 6 characters.";

        return;
    }

    if (password !== confirmPassword) {

        errorEl.textContent =
            "Passwords do not match.";

        return;
    }


    try {

        const response =
            await fetch(`${API}/signup`, {

                method: "POST",

                headers: {
                    "Content-Type":
                        "application/x-www-form-urlencoded"
                },

                body:
                    new URLSearchParams({
                        username: username,
                        password: password,
                        favColor: favColor,
                        favFruit: favFruit
                    })
            });

        const result =
            await response.json();

        if (!result.success) {

            errorEl.textContent =
                result.message || "Could not create account.";

            return;
        }

        localStorage.setItem(AUTH_KEY, result.username);

        justSignedUp = true;

        showAppScreen(result.username);

        await loadTasks();

        await initializeDeviceNotifications();

        showDashboard();

    }
    catch (error) {

        console.error("Signup error:", error);

        errorEl.textContent =
            "Could not connect to the server.";
    }
}


/* =========================================================
   AUTH - LOGOUT
   ========================================================= */

function logoutUser() {

    stopNotificationChecker();

    localStorage.removeItem(AUTH_KEY);

    closeProfileMenu();

    document.getElementById("loginUsername").value = "";
    document.getElementById("loginPassword").value = "";

    document.getElementById("sidebarTitle").style.display = "block";

    showAuthScreen();

    showLogin();
}


/* =========================================================
   PROFILE DROPDOWN
   ========================================================= */

function toggleProfileMenu() {

    document.getElementById("profileDropdown")
        .classList.toggle("open");
}


function closeProfileMenu() {

    const dropdown =
        document.getElementById("profileDropdown");

    if (dropdown) {
        dropdown.classList.remove("open");
    }
}


/* =========================================================
   CHANGE USERNAME
   ========================================================= */

function openChangeUsername() {

    closeProfileMenu();

    document.getElementById("usernameModal").style.display = "flex";
}


function closeChangeUsername() {

    document.getElementById("usernameModal").style.display = "none";

    document.getElementById("newUsernameInput").value = "";
    document.getElementById("usernameConfirmPassword").value = "";
    document.getElementById("usernameChangeError").textContent = "";
}


async function submitChangeUsername() {

    const currentUsername = getLoggedInUser();

    const newUsername =
        document.getElementById("newUsernameInput").value.trim();

    const password =
        document.getElementById("usernameConfirmPassword").value;

    const errorEl =
        document.getElementById("usernameChangeError");

    errorEl.textContent = "";


    if (!newUsername || !password) {

        errorEl.textContent =
            "Please fill all fields.";

        return;
    }


    try {

        const response =
            await fetch(`${API}/update-username`, {

                method: "POST",

                headers: {
                    "Content-Type":
                        "application/x-www-form-urlencoded"
                },

                body:
                    new URLSearchParams({
                        currentUsername: currentUsername,
                        newUsername: newUsername,
                        password: password
                    })
            });

        const result =
            await response.json();

        if (!result.success) {

            errorEl.textContent =
                result.message || "Could not update username.";

            return;
        }

        localStorage.setItem(AUTH_KEY, result.username);

        updateProfileDisplay(result.username);

        closeChangeUsername();

    }
    catch (error) {

        console.error("Change username error:", error);

        errorEl.textContent =
            "Could not connect to the server.";
    }
}


/* =========================================================
   CHANGE PASSWORD
   ========================================================= */

function openChangePassword() {

    closeProfileMenu();

    document.getElementById("passwordModal").style.display = "flex";
}


function closeChangePassword() {

    document.getElementById("passwordModal").style.display = "none";

    document.getElementById("passwordFavColor").value = "";
    document.getElementById("passwordFavFruit").value = "";
    document.getElementById("newPasswordInput").value = "";
    document.getElementById("passwordChangeError").textContent = "";
}


async function submitChangePassword() {

    const username = getLoggedInUser();

    const favColor =
        document.getElementById("passwordFavColor").value;

    const favFruit =
        document.getElementById("passwordFavFruit").value;

    const newPassword =
        document.getElementById("newPasswordInput").value;

    const errorEl =
        document.getElementById("passwordChangeError");

    errorEl.textContent = "";


    if (!favColor || !favFruit || !newPassword) {

        errorEl.textContent =
            "Please answer your security questions and enter a new password.";

        return;
    }

    if (newPassword.length < 6) {

        errorEl.textContent =
            "New password must be at least 6 characters.";

        return;
    }


    try {

        const response =
            await fetch(`${API}/update-password`, {

                method: "POST",

                headers: {
                    "Content-Type":
                        "application/x-www-form-urlencoded"
                },

                body:
                    new URLSearchParams({
                        username: username,
                        favColor: favColor,
                        favFruit: favFruit,
                        newPassword: newPassword
                    })
            });

        const result =
            await response.json();

        if (!result.success) {

            errorEl.textContent =
                result.message || "Could not update password.";

            return;
        }

        closeChangePassword();

        alert("Password updated successfully.");

    }
    catch (error) {

        console.error("Change password error:", error);

        errorEl.textContent =
            "Could not connect to the server.";
    }
}


/* =========================================================
   CHANGE SECURITY QUESTIONS
   ========================================================= */

function openChangeSecurity() {

    closeProfileMenu();

    document.getElementById("securityModal").style.display = "flex";
}


function closeChangeSecurity() {

    document.getElementById("securityModal").style.display = "none";

    document.getElementById("securityCurrentPassword").value = "";
    document.getElementById("securityFavColor").value = "";
    document.getElementById("securityFavFruit").value = "";
    document.getElementById("securityChangeError").textContent = "";
}


async function submitChangeSecurity() {

    const username = getLoggedInUser();

    const currentPassword =
        document.getElementById("securityCurrentPassword").value;

    const favColor =
        document.getElementById("securityFavColor").value;

    const favFruit =
        document.getElementById("securityFavFruit").value;

    const errorEl =
        document.getElementById("securityChangeError");

    errorEl.textContent = "";


    if (!currentPassword || !favColor || !favFruit) {

        errorEl.textContent =
            "Please fill all fields.";

        return;
    }


    try {

        const response =
            await fetch(`${API}/update-security`, {

                method: "POST",

                headers: {
                    "Content-Type":
                        "application/x-www-form-urlencoded"
                },

                body:
                    new URLSearchParams({
                        username: username,
                        password: currentPassword,
                        favColor: favColor,
                        favFruit: favFruit
                    })
            });

        const result =
            await response.json();

        if (!result.success) {

            errorEl.textContent =
                result.message || "Could not update security questions.";

            return;
        }

        closeChangeSecurity();

        alert("Security questions updated.");

    }
    catch (error) {

        console.error("Change security questions error:", error);

        errorEl.textContent =
            "Could not connect to the server.";
    }
}


/* =========================================================
   DAILY SCHEDULE (separate from reminders)

   Data model: every schedule item belongs to a day of the week
   (mon..sun). "Just today" is one weekday filled in; "weekly" is
   all seven. Reminders are never touched by any of this - they
   live in `tasks` and go through /add, while schedule items live
   in `scheduleData` and go through /schedule/*.
   ========================================================= */

let scheduleWakeTimeValue = "";
let scheduleLastTaskName = "";
let scheduleTaskCount = 0;
let scheduleWizardDay = "mon";
let scheduleWizardTasks = [];


function getTodayDayAbbrev() {

    const map = ["sun", "mon", "tue", "wed", "thu", "fri", "sat"];

    return map[new Date().getDay()];
}


function getNextDateForDay(day) {

    const targetIndex = DAY_TO_JS_INDEX[day];

    const today = new Date();

    let diff = targetIndex - today.getDay();

    if (diff < 0) {
        diff += 7;
    }

    const result = new Date(today);

    result.setDate(today.getDate() + diff);

    return result.toISOString().slice(0, 10);
}


function escapeHtml(text) {

    const div = document.createElement("div");

    div.textContent = text == null ? "" : String(text);

    return div.innerHTML;
}


async function loadScheduleData() {

    try {

        const username = getLoggedInUser() || "";

        const response =
            await fetch(
                `${API}/schedule?username=${encodeURIComponent(username)}`
            );

        const data = await response.json();

        scheduleData =
            (data && Array.isArray(data.schedule))
                ? data.schedule
                : [];

    }
    catch (error) {

        console.error("Could not load schedule:", error);

        scheduleData = [];
    }
}


/* ---------------------------------------------------------
   ENTRY POINT - sidebar "Daily Schedule" button
   --------------------------------------------------------- */

async function openDailySchedule() {

    await loadScheduleData();

    if (scheduleData.length > 0) {

        openScheduleWeekView();

        return;
    }

    startNewScheduleWizard();
}


function startNewScheduleWizard() {

    document.getElementById("scheduleModal").style.display = "flex";

    document.getElementById("scheduleStepWake").style.display = "block";
    document.getElementById("scheduleStepTasks").style.display = "none";
    document.getElementById("scheduleStepWeekly").style.display = "none";

    document.getElementById("scheduleStepTitle").textContent =
        "Set your wake-up time";

    document.getElementById("scheduleWakeTime").value = "";

    scheduleWakeTimeValue = "";
    scheduleLastTaskName = "";
    scheduleTaskCount = 0;
    scheduleWizardDay = getTodayDayAbbrev();
    scheduleWizardTasks = [];
}


function startWizardForDay(day) {

    document.getElementById("scheduleWeekModal").style.display = "none";

    startNewScheduleWizard();

    scheduleWizardDay = day;

    document.getElementById("scheduleStepTitle").textContent =
        `Set a wake-up time for ${DAY_LABELS[day]}`;
}


function closeDailySchedule() {

    document.getElementById("scheduleModal").style.display = "none";

    document.getElementById("scheduleTaskName").value = "";
    document.getElementById("scheduleTaskStart").value = "";
    document.getElementById("scheduleTaskEnd").value = "";
    document.getElementById("scheduleError").textContent = "";

    // Refresh the dashboard in case the wizard added anything
    showView(currentView);
}


function startScheduleTasks() {

    const wakeTime =
        document.getElementById("scheduleWakeTime").value;

    if (!wakeTime) {

        alert("Please pick a wake-up time.");

        return;
    }

    scheduleWakeTimeValue = wakeTime;

    document.getElementById("scheduleStepWake").style.display = "none";
    document.getElementById("scheduleStepTasks").style.display = "block";

    document.getElementById("scheduleStepTitle").textContent =
        "Build your day";

    document.getElementById("scheduleTaskLabel").textContent =
        "Task after waking up";

    document.getElementById("scheduleTaskStart").value = wakeTime;
    document.getElementById("scheduleTaskEnd").value = "";

    document.getElementById("schedulePrevTask").textContent = "";
}


async function addScheduleTask() {

    const name =
        document.getElementById("scheduleTaskName").value.trim();

    const start =
        document.getElementById("scheduleTaskStart").value;

    const end =
        document.getElementById("scheduleTaskEnd").value;

    const errorEl =
        document.getElementById("scheduleError");

    errorEl.textContent = "";


    if (!name || !start) {

        errorEl.textContent =
            "Please enter a task name and a start time.";

        return;
    }


    try {

        const response =
            await fetch(`${API}/schedule/add`, {

                method: "POST",

                headers: {
                    "Content-Type":
                        "application/x-www-form-urlencoded"
                },

                body:
                    new URLSearchParams({
                        username: getLoggedInUser() || "",
                        day: scheduleWizardDay,
                        name: name,
                        startTime: start,
                        endTime: end
                    })
            });

        const result =
            await response.json();

        if (!result.success) {

            errorEl.textContent =
                result.message || "Could not save that task.";

            return;
        }

        scheduleWizardTasks.push({
            id: result.id,
            name: name,
            startTime: start,
            endTime: end
        });

        // Faded preview of the task that was just entered, shown
        // while the user types the next one
        scheduleLastTaskName = name;
        scheduleTaskCount++;

        document.getElementById("schedulePrevTask").textContent =
            `Last: ${scheduleLastTaskName}`;

        document.getElementById("scheduleTaskLabel").textContent =
            `Task ${scheduleTaskCount + 1} (after "${scheduleLastTaskName}")`;

        document.getElementById("scheduleTaskName").value = "";

        // Chain the next task's start time onto this one's end
        // time (falling back to its own start) so the user isn't
        // stuck re-entering the same time over and over.
        document.getElementById("scheduleTaskStart").value =
            end || start;

        document.getElementById("scheduleTaskEnd").value = "";

        document.getElementById("scheduleTaskName").focus();

    }
    catch (error) {

        console.error("Schedule task error:", error);

        errorEl.textContent =
            "Could not connect to the server.";
    }
}


function finishScheduleDay() {

    if (scheduleWizardTasks.length === 0) {

        closeDailySchedule();

        return;
    }

    document.getElementById("scheduleStepTasks").style.display = "none";
    document.getElementById("scheduleStepWeekly").style.display = "block";

    document.getElementById("scheduleStepTitle").textContent =
        "One more thing";
}


async function skipWeeklySchedule() {

    document.getElementById("scheduleModal").style.display = "none";

    await loadScheduleData();

    openScheduleWeekView();
}


async function applyWeeklySchedule() {

    const username = getLoggedInUser() || "";

    const otherDays =
        ALL_DAYS.filter(day => day !== scheduleWizardDay);

    try {

        for (const day of otherDays) {

            for (const task of scheduleWizardTasks) {

                await fetch(`${API}/schedule/add`, {

                    method: "POST",

                    headers: {
                        "Content-Type":
                            "application/x-www-form-urlencoded"
                    },

                    body:
                        new URLSearchParams({
                            username: username,
                            day: day,
                            name: task.name,
                            startTime: task.startTime,
                            endTime: task.endTime || ""
                        })
                });
            }
        }

    }
    catch (error) {

        console.error("Apply weekly schedule error:", error);

        alert("Could not copy this schedule to every day. Please try again.");
    }

    document.getElementById("scheduleModal").style.display = "none";

    await loadScheduleData();

    openScheduleWeekView();
}


/* ---------------------------------------------------------
   WEEKLY TABLE VIEW
   --------------------------------------------------------- */

function openScheduleWeekView() {

    document.getElementById("scheduleWeekModal").style.display = "flex";

    activeScheduleDay = getTodayDayAbbrev();

    renderWeekTabs();
    renderScheduleDay(activeScheduleDay);
}


function closeScheduleWeekView() {

    document.getElementById("scheduleWeekModal").style.display = "none";

    showView(currentView);
}


function renderWeekTabs() {

    document.querySelectorAll(".week-tab").forEach(button => {

        button.classList.toggle(
            "active",
            button.dataset.day === activeScheduleDay
        );
    });
}


function showScheduleDay(day) {

    activeScheduleDay = day;

    renderWeekTabs();
    renderScheduleDay(day);
}


function renderScheduleDay(day) {

    const container =
        document.getElementById("scheduleWeekDayView");

    if (!container) {
        return;
    }

    const dayTasks =
        scheduleData
            .filter(task => task.day === day)
            .sort((a, b) =>
                (a.startTime || "").localeCompare(b.startTime || "")
            );

    if (dayTasks.length === 0) {

        container.innerHTML =
            `<p class="empty">Nothing planned for ${DAY_LABELS[day]} yet.</p>` +
            `<button class="save" onclick="startWizardForDay('${day}')">+ Plan this day</button>`;

        return;
    }

    container.innerHTML = "";

    dayTasks.forEach(task => {

        const row =
            document.createElement("div");

        row.className = "schedule-row";

        const info =
            document.createElement("div");

        info.innerHTML =
            `<strong>${escapeHtml(task.name)}</strong>` +
            `<p>${escapeHtml(task.startTime)}` +
            (task.endTime ? ` – ${escapeHtml(task.endTime)}` : "") +
            `</p>`;

        const remindButton =
            document.createElement("button");

        remindButton.textContent = "🔔 Remind";

        remindButton.onclick = function () {
            openReminderFromSchedule(task);
        };

        row.appendChild(info);
        row.appendChild(remindButton);

        container.appendChild(row);
    });
}


async function applyDayToWholeWeek(sourceDay) {

    const sourceTasks =
        scheduleData.filter(task => task.day === sourceDay);

    if (sourceTasks.length === 0) {

        alert(`${DAY_LABELS[sourceDay]} has no tasks to copy yet.`);

        return;
    }

    const confirmed =
        confirm(
            `Copy ${DAY_LABELS[sourceDay]}'s schedule to every other ` +
            `day of the week? This replaces whatever is currently on ` +
            `those days.`
        );

    if (!confirmed) {
        return;
    }

    const username = getLoggedInUser() || "";

    const otherDays =
        ALL_DAYS.filter(day => day !== sourceDay);

    try {

        for (const day of otherDays) {

            const existingIds =
                scheduleData
                    .filter(task => task.day === day)
                    .map(task => task.id);

            for (const id of existingIds) {

                await fetch(`${API}/schedule/delete`, {

                    method: "POST",

                    headers: {
                        "Content-Type":
                            "application/x-www-form-urlencoded"
                    },

                    body:
                        new URLSearchParams({
                            id: String(id),
                            username: username
                        })
                });
            }

            for (const task of sourceTasks) {

                await fetch(`${API}/schedule/add`, {

                    method: "POST",

                    headers: {
                        "Content-Type":
                            "application/x-www-form-urlencoded"
                    },

                    body:
                        new URLSearchParams({
                            username: username,
                            day: day,
                            name: task.name,
                            startTime: task.startTime,
                            endTime: task.endTime || ""
                        })
                });
            }
        }

        await loadScheduleData();

        renderScheduleDay(activeScheduleDay);

        alert("Applied to the whole week.");

    }
    catch (error) {

        console.error("Apply to whole week error:", error);

        alert("Could not update every day. Please try again.");
    }
}


/* ---------------------------------------------------------
   EDIT ONE DAY
   --------------------------------------------------------- */

let editDayTasks = [];


function openEditDay() {

    document.getElementById("scheduleWeekModal").style.display = "none";
    document.getElementById("scheduleEditDayModal").style.display = "flex";

    document.getElementById("editDaySelect").value = activeScheduleDay;

    loadEditDayTasks(activeScheduleDay);
}


function loadEditDayTasks(day) {

    editDayTasks =
        scheduleData
            .filter(task => task.day === day)
            .map(task => ({
                id: task.id,
                name: task.name,
                startTime: task.startTime,
                endTime: task.endTime
            }))
            .sort((a, b) =>
                (a.startTime || "").localeCompare(b.startTime || "")
            );

    renderEditDayRows();
}


function switchEditDay() {

    const day =
        document.getElementById("editDaySelect").value;

    loadEditDayTasks(day);
}


function renderEditDayRows() {

    const container =
        document.getElementById("editDayRows");

    container.innerHTML = "";

    editDayTasks.forEach((task, index) => {

        const row =
            document.createElement("div");

        row.className = "edit-row";

        const nameInput =
            document.createElement("input");

        nameInput.type = "text";
        nameInput.placeholder = "Task name";
        nameInput.value = task.name;

        nameInput.oninput = function (event) {
            editDayTasks[index].name = event.target.value;
        };

        const startInput =
            document.createElement("input");

        startInput.type = "time";
        startInput.value = task.startTime || "";

        startInput.oninput = function (event) {
            editDayTasks[index].startTime = event.target.value;
        };

        const endInput =
            document.createElement("input");

        endInput.type = "time";
        endInput.value = task.endTime || "";

        endInput.oninput = function (event) {
            editDayTasks[index].endTime = event.target.value;
        };

        const removeButton =
            document.createElement("button");

        removeButton.type = "button";
        removeButton.className = "edit-row-remove";
        removeButton.textContent = "✕";

        removeButton.onclick = function () {
            editDayTasks.splice(index, 1);
            renderEditDayRows();
        };

        row.appendChild(nameInput);
        row.appendChild(startInput);
        row.appendChild(endInput);
        row.appendChild(removeButton);

        container.appendChild(row);
    });
}


function addEditRow() {

    editDayTasks.push({
        id: null,
        name: "",
        startTime: "",
        endTime: ""
    });

    renderEditDayRows();
}


function closeEditDay() {

    document.getElementById("scheduleEditDayModal").style.display = "none";
    document.getElementById("scheduleWeekModal").style.display = "flex";
}


async function saveEditDay() {

    const day =
        document.getElementById("editDaySelect").value;

    const username = getLoggedInUser() || "";

    const validTasks =
        editDayTasks.filter(task => task.name.trim() && task.startTime);

    try {

        // Replace the day wholesale: remove every existing row for
        // it, then re-add the edited list. Simple and avoids ever
        // getting out of sync with what's on screen.
        const existingIds =
            scheduleData
                .filter(task => task.day === day)
                .map(task => task.id);

        for (const id of existingIds) {

            await fetch(`${API}/schedule/delete`, {

                method: "POST",

                headers: {
                    "Content-Type":
                        "application/x-www-form-urlencoded"
                },

                body:
                    new URLSearchParams({
                        id: String(id),
                        username: username
                    })
            });
        }

        for (const task of validTasks) {

            await fetch(`${API}/schedule/add`, {

                method: "POST",

                headers: {
                    "Content-Type":
                        "application/x-www-form-urlencoded"
                },

                body:
                    new URLSearchParams({
                        username: username,
                        day: day,
                        name: task.name.trim(),
                        startTime: task.startTime,
                        endTime: task.endTime || ""
                    })
            });
        }

        await loadScheduleData();

        closeEditDay();

        activeScheduleDay = day;

        renderWeekTabs();
        renderScheduleDay(day);

    }
    catch (error) {

        console.error("Save schedule day error:", error);

        alert("Could not save your changes. Please try again.");
    }
}


/* ---------------------------------------------------------
   SAVE A SCHEDULE TASK AS A REMINDER
   --------------------------------------------------------- */

let reminderFromScheduleTask = null;


function openReminderFromSchedule(task) {

    reminderFromScheduleTask = task;

    const date = getNextDateForDay(task.day);

    document.getElementById("reminderPreviewText").textContent =
        `${task.name} — ${DAY_LABELS[task.day]} (${date}) at ${task.startTime}`;

    document.getElementById("reminderFromSchedulePriority").value = "2";

    document.getElementById("scheduleReminderModal").style.display = "flex";
}


function closeReminderFromSchedule() {

    document.getElementById("scheduleReminderModal").style.display = "none";

    reminderFromScheduleTask = null;
}


async function confirmReminderFromSchedule() {

    if (!reminderFromScheduleTask) {
        return;
    }

    const priority =
        document.getElementById("reminderFromSchedulePriority").value;

    const date =
        getNextDateForDay(reminderFromScheduleTask.day);

    try {

        const response =
            await fetch(`${API}/add`, {

                method: "POST",

                headers: {
                    "Content-Type":
                        "application/x-www-form-urlencoded"
                },

                body:
                    new URLSearchParams({
                        username: getLoggedInUser() || "",
                        name: reminderFromScheduleTask.name,
                        date: date,
                        time: reminderFromScheduleTask.startTime,
                        priority: priority
                    })
            });

        const result =
            await response.json();

        if (!result.success) {

            alert("Could not save that reminder.");

            return;
        }

        tasks.push({
            id: result.id,
            name: reminderFromScheduleTask.name,
            date: date,
            time: reminderFromScheduleTask.startTime,
            priority: Number(priority),
            completed: false
        });

        normalizeTasks();

        updateStatistics();
        updateNextTask();

        closeReminderFromSchedule();

        alert("Saved as a reminder.");

    }
    catch (error) {

        console.error("Reminder from schedule error:", error);

        alert("Could not connect to the server.");
    }
}


/* =========================================================
   AI ASSISTANT
   SmartReminder server-side Gemini
   Users DO NOT need a Gemini API key.
   ========================================================= */

const AI_SYSTEM_PROMPT =
    "You are the built-in assistant inside a reminder and daily-schedule app called Smart Reminder. " +
    "Only help with planning the user's day, building or adjusting their weekly schedule, and turning " +
    "things into reminders. Politely decline anything unrelated to scheduling, reminders, or daily " +
    "planning, and steer the conversation back to those topics. Keep replies short and practical.\n\n" +
    "Whenever the user asks you to build or change a day plan or schedule, end your reply with a " +
    "fenced block exactly like this:\n" +
    "```schedule\n" +
    "[{\"day\":\"mon\",\"name\":\"Wake up\",\"start\":\"06:00\",\"end\":\"06:15\"}]\n" +
    "```\n" +
    "Use lowercase three-letter day codes (mon, tue, wed, thu, fri, sat, sun), 24-hour HH:MM times, " +
    "and one object per task. Only include the day(s) the user actually asked about. " +
    "If you are not proposing a schedule, omit the fenced block.";


/* =========================================================
   OPEN / CLOSE AI CHAT
   ========================================================= */

function toggleAiChat() {

    const panel = document.getElementById("aiChatPanel");

    if (!panel) {
        console.error("AI chat panel not found.");
        return;
    }

    panel.classList.toggle("open");
}


function appendAiMessage(text, who) {

    const container =
        document.getElementById("aiChatMessages");

    if (!container) {
        console.error("AI messages container not found.");
        return null;
    }

    const bubble =
        document.createElement("p");

    bubble.className =
        who === "user"
            ? "ai-msg ai-msg-user"
            : "ai-msg ai-msg-bot";

    bubble.textContent = text;

    container.appendChild(bubble);

    container.scrollTop =
        container.scrollHeight;

    return bubble;
}


/* =========================================================
   PARSE AI SCHEDULE
   ========================================================= */

function extractScheduleBlock(text) {

    const match =
        text.match(/```schedule\s*([\s\S]*?)```/i);

    if (!match) {

        return {
            cleanText: text.trim(),
            items: null
        };
    }

    const cleanText =
        (
            text.slice(0, match.index) +
            text.slice(match.index + match[0].length)
        ).trim();

    let items = null;

    try {

        const parsed =
            JSON.parse(match[1].trim());

        if (Array.isArray(parsed)) {

            items =
                parsed
                    .filter(function (item) {

                        return (
                            item &&
                            item.day &&
                            item.name &&
                            item.start
                        );
                    })
                    .map(function (item) {

                        return {
                            day:
                                String(item.day)
                                    .toLowerCase()
                                    .slice(0, 3),

                            name:
                                String(item.name),

                            startTime:
                                String(item.start),

                            endTime:
                                item.end
                                    ? String(item.end)
                                    : ""
                        };
                    })
                    .filter(function (item) {

                        return (
                            typeof ALL_DAYS !== "undefined" &&
                            ALL_DAYS.includes(item.day)
                        );
                    });
        }

    }
    catch (error) {

        console.error(
            "Could not parse AI schedule:",
            error
        );
    }

    return {
        cleanText,
        items
    };
}


/* =========================================================
   SHOW SCHEDULE PREVIEW
   ========================================================= */

function renderAiSchedulePreview(items) {

    const container =
        document.getElementById("aiChatMessages");

    if (!container) {
        return;
    }

    const card =
        document.createElement("div");

    card.className =
        "ai-schedule-preview";


    const title =
        document.createElement("strong");

    title.textContent =
        "Suggested schedule";

    card.appendChild(title);


    const byDay = {};


    items.forEach(function (item) {

        if (!byDay[item.day]) {

            byDay[item.day] = [];
        }

        byDay[item.day].push(item);
    });


    Object.keys(byDay).forEach(function (day) {

        const dayLine =
            document.createElement("p");

        const label =
            typeof DAY_LABELS !== "undefined"
                ? DAY_LABELS[day] || day
                : day;

        dayLine.innerHTML =
            `<strong>${label}</strong>`;

        card.appendChild(dayLine);


        byDay[day].forEach(function (item) {

            const line =
                document.createElement("p");

            line.className =
                "ai-schedule-preview-row";

            line.textContent =
                `${item.startTime}` +
                (
                    item.endTime
                        ? `–${item.endTime}`
                        : ""
                ) +
                ` · ${item.name}`;

            card.appendChild(line);
        });
    });


    const actions =
        document.createElement("div");

    actions.className =
        "ai-schedule-preview-actions";


    const keepButton =
        document.createElement("button");

    keepButton.className =
        "save";

    keepButton.textContent =
        "Keep";


    const undoButton =
        document.createElement("button");

    undoButton.textContent =
        "Undo";


    keepButton.onclick =
        async function () {

            keepButton.disabled = true;
            undoButton.disabled = true;

            const success =
                await applyAiSchedule(items);

            if (success) {

                card.remove();

                appendAiMessage(
                    "Done — your schedule has been updated.",
                    "bot"
                );
            }
            else {

                keepButton.disabled = false;
                undoButton.disabled = false;
            }
        };


    undoButton.onclick =
        function () {

            card.remove();

            appendAiMessage(
                "No problem — I left your schedule as it was.",
                "bot"
            );
        };


    actions.appendChild(keepButton);
    actions.appendChild(undoButton);

    card.appendChild(actions);

    container.appendChild(card);

    container.scrollTop =
        container.scrollHeight;
}


/* =========================================================
   SAVE AI SCHEDULE
   ========================================================= */

async function applyAiSchedule(items) {

    const username =
        typeof getLoggedInUser === "function"
            ? getLoggedInUser() || ""
            : "";

    try {

        if (typeof loadScheduleData === "function") {

            await loadScheduleData();
        }


        const affectedDays =
            [
                ...new Set(
                    items.map(function (item) {
                        return item.day;
                    })
                )
            ];


        /*
         * Delete existing schedule entries
         * for the days AI changed.
         */

        if (typeof scheduleData !== "undefined") {

            for (const day of affectedDays) {

                const existingIds =
                    scheduleData
                        .filter(function (task) {

                            return task.day === day;
                        })
                        .map(function (task) {

                            return task.id;
                        });


                for (const id of existingIds) {

                    await fetch(
                        `${API}/schedule/delete`,
                        {
                            method: "POST",

                            headers: {
                                "Content-Type":
                                    "application/x-www-form-urlencoded"
                            },

                            body:
                                new URLSearchParams({
                                    id: String(id),
                                    username: username
                                })
                        }
                    );
                }
            }
        }


        /*
         * Add the new AI-generated schedule.
         */

        for (const item of items) {

            const response =
                await fetch(
                    `${API}/schedule/add`,
                    {
                        method: "POST",

                        headers: {
                            "Content-Type":
                                "application/x-www-form-urlencoded"
                        },

                        body:
                            new URLSearchParams({

                                username:
                                    username,

                                day:
                                    item.day,

                                name:
                                    item.name,

                                startTime:
                                    item.startTime,

                                endTime:
                                    item.endTime || ""
                            })
                    }
                );


            if (!response.ok) {

                throw new Error(
                    "Could not save schedule item."
                );
            }
        }


        if (
            typeof loadScheduleData === "function"
        ) {

            await loadScheduleData();
        }


        const weekModal =
            document.getElementById(
                "scheduleWeekModal"
            );


        if (
            weekModal &&
            weekModal.style.display === "flex" &&
            typeof renderScheduleDay === "function"
        ) {

            renderScheduleDay(
                typeof activeScheduleDay !== "undefined"
                    ? activeScheduleDay
                    : affectedDays[0]
            );
        }


        return true;
    }

    catch (error) {

        console.error(
            "Apply AI schedule error:",
            error
        );

        appendAiMessage(
            "I couldn't save that schedule — please try again.",
            "bot"
        );

        return false;
    }
}


/* =========================================================
   SEND MESSAGE TO OUR BACKEND
   ========================================================= */

async function sendAiChatMessage() {

    const input =
        document.getElementById("aiChatInput");

    if (!input) {

        console.error(
            "AI input not found."
        );

        return;
    }


    const text =
        input.value.trim();


    if (!text) {
        return;
    }


    appendAiMessage(
        text,
        "user"
    );


    input.value = "";


    const thinkingBubble =
        appendAiMessage(
            "Thinking...",
            "bot"
        );


    try {

        /*
         * IMPORTANT:
         *
         * We DO NOT send a Gemini API key
         * from the browser.
         *
         * The backend reads:
         *
         * GEMINI_API_KEY
         *
         * from Render environment variables.
         */

        const response = await fetch(
    `${API}/ai-chat`,
    {
        method: "POST",

        headers: {
            "Content-Type": "application/x-www-form-urlencoded"
        },

        body: `message=${encodeURIComponent(text)}`
    }
);


        let data;

        try {

            data =
                await response.json();

        }
        catch (jsonError) {

            throw new Error(
                "The server returned an invalid response."
            );
        }


        if (thinkingBubble) {

            thinkingBubble.remove();
        }


        if (!response.ok) {

            appendAiMessage(
                data.message ||
                "AI service returned an error.",
                "bot"
            );

            return;
        }


        if (data.success === false) {

            appendAiMessage(
                data.message ||
                "The AI service is not available.",
                "bot"
            );

            return;
        }


        /*
         * The backend may return Gemini's
         * normal response directly.
         */

        let reply = "";


        if (
            data.candidates &&
            data.candidates[0] &&
            data.candidates[0].content &&
            data.candidates[0].content.parts
        ) {

            reply =
                data.candidates[0]
                    .content
                    .parts
                    .map(function (part) {

                        return part.text || "";
                    })
                    .join("");
        }


        /*
         * Also support a backend response
         * containing {reply:"..."}.
         */

        if (
            !reply &&
            typeof data.reply === "string"
        ) {

            reply =
                data.reply;
        }


        /*
         * Support a backend response
         * containing {message:"..."}.
         */

        if (
            !reply &&
            typeof data.message === "string"
        ) {

            reply =
                data.message;
        }


        if (!reply) {

            appendAiMessage(
                "Sorry, I didn't get a response from the AI.",
                "bot"
            );

            return;
        }


        const result =
            extractScheduleBlock(reply);


        if (result.cleanText) {

            appendAiMessage(
                result.cleanText,
                "bot"
            );
        }


        if (
            result.items &&
            result.items.length > 0
        ) {

            renderAiSchedulePreview(
                result.items
            );
        }

    }

    catch (error) {

        console.error(
            "AI chat error:",
            error
        );


        if (thinkingBubble) {

            thinkingBubble.remove();
        }


        appendAiMessage(
            "Could not reach the AI service. Please try again.",
            "bot"
        );
    }
}


/* =========================================================
   AI INPUT ENTER KEY
   ========================================================= */

document.addEventListener(
    "DOMContentLoaded",
    function () {

        const aiInput =
            document.getElementById(
                "aiChatInput"
            );


        if (aiInput) {

            aiInput.addEventListener(
                "keydown",
                function (event) {

                    if (
                        event.key === "Enter" &&
                        !event.shiftKey
                    ) {

                        event.preventDefault();

                        sendAiChatMessage();
                    }
                       }
    );
}
});
// ============================================================
// NOTIFICATION ACTIONS
// ============================================================

navigator.serviceWorker.addEventListener("message", async function (event) {

    if (!event.data || event.data.type !== "REMINDER_ACTION") {
        return;
    }

    const action = event.data.action;
    const taskId = event.data.taskId;

    if (!taskId) {
        return;
    }

    // ----------------------------
    // COMPLETE
    // ----------------------------

    if (action === "complete") {

        await completeTask(taskId);

        return;
    }


    // ----------------------------
    // SNOOZE 15 MINUTES
    // ----------------------------

    if (action === "snooze") {

        const task = tasks.find(
            item => String(item.id) === String(taskId)
        );

        if (!task) {
            console.error("Snooze: task not found.");
            return;
        }

        const snoozeTime = new Date(
            Date.now() + 15 * 60 * 1000
        );

        const year = snoozeTime.getFullYear();
        const month = String(
            snoozeTime.getMonth() + 1
        ).padStart(2, "0");

        const day = String(
            snoozeTime.getDate()
        ).padStart(2, "0");

        const hours = String(
            snoozeTime.getHours()
        ).padStart(2, "0");

        const minutes = String(
            snoozeTime.getMinutes()
        ).padStart(2, "0");

        const newDate =
            `${year}-${month}-${day}`;

        const newTime =
            `${hours}:${minutes}`;

        try {

            // Create the snoozed reminder
            const response = await fetch(`${API}/add`, {
                method: "POST",

                headers: {
                    "Content-Type":
                        "application/x-www-form-urlencoded"
                },

                body: new URLSearchParams({
                    username:
                        getLoggedInUser() || "",

                    name:
                        task.name,

                    date:
                        newDate,

                    time:
                        newTime,

                    priority:
                        String(task.priority)
                })
            });

            if (!response.ok) {
                throw new Error(
                    `HTTP ${response.status}`
                );
            }

            const result =
                await response.json();

            if (!result.success) {
                console.error(
                    "Could not create snoozed reminder."
                );
                return;
            }

            // Complete the original reminder
            await completeTask(taskId);

            // Reload reminders
            await loadTasks();

            updateStatistics();
            updateNextTask();
            showView(currentView);

        }
        catch (error) {

            console.error(
                "Snooze error:",
                error
            );

        }
    }

});