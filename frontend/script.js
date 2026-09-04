// ==========================================
// SMART REMINDER - FRONTEND
// ==========================================

let tasks = [];
let currentView = "dashboard";

const API = "https://smartreminder-zllc.onrender.com";

const AUTH_KEY = "smartReminderUser";

// Which calendar month is currently on screen. Only the
// previous, current, and next real-world month are allowed
// (see changeCalendarMonth).
let calendarDate = new Date();
let selectedCalendarDay = null;


// ==========================================
// INITIALIZE
// ==========================================

document.addEventListener("DOMContentLoaded", async () => {

    applyTheme();

    const loggedInUser = getLoggedInUser();

    if (loggedInUser) {

        showAppScreen(loggedInUser);

        await loadTasks();

        showDashboard();

    }
    else {

        showAuthScreen();

        showLogin();
    }

    // Close modal when clicking outside it
    window.addEventListener("click", function (event) {

        const modalIds = [
            "taskModal",
            "usernameModal",
            "passwordModal",
            "forgotModal",
            "securityModal"
        ];

        modalIds.forEach(function (id) {

            const modal = document.getElementById(id);

            if (event.target === modal) {

                modal.style.display = "none";
            }
        });
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
// LOAD TASKS FROM C++ SERVER (SCOPED TO THE LOGGED-IN USER)
// ==========================================

async function loadTasks() {

    const username = getLoggedInUser();

    if (!username) {

        tasks = [];

        updateStatistics();
        updateNextTask();

        return;
    }

    try {

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

    const taskListEl =
        document.getElementById("taskList");

    const calendarViewEl =
        document.getElementById("calendarView");


    // ======================================
    // DASHBOARD
    // ======================================

    if (view === "dashboard") {

        stats.style.display = "grid";

        important.style.display = "block";

        upcoming.style.display = "block";

        taskListEl.style.display = "block";
        calendarViewEl.style.display = "none";

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

        taskListEl.style.display = "block";
        calendarViewEl.style.display = "none";

        upcomingTitle.textContent =
            "All Tasks";

        renderTaskList(tasks);

        return;
    }


    // ======================================
    // CALENDAR
    // ======================================

    if (view === "calendar") {

        taskListEl.style.display = "none";
        calendarViewEl.style.display = "block";

        addButton.style.display = "none";

        upcomingTitle.textContent =
            "Calendar";

        // Always come back into the calendar on the current
        // month, looking at today.
        calendarDate = new Date();
        selectedCalendarDay = formatDateYMD(calendarDate);

        renderCalendar();

        return;
    }


    // ======================================
    // COMPLETED
    // ======================================

    if (view === "completed") {

        taskListEl.style.display = "block";
        calendarViewEl.style.display = "none";

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

    const pending =
        tasks.filter(task => !task.completed);


    if (pending.length === 0) {

        alert("🔔 No pending reminders.");

        return;
    }


    const importantTask =
        [...pending].sort((a, b) => {

            if (b.priority !== a.priority) {
                return b.priority - a.priority;
            }

            return (
                `${a.date} ${a.time}`
            ).localeCompare(
                `${b.date} ${b.time}`
            );

        })[0];


    alert(
        "🔔 Reminder Notification\n\n" +

        importantTask.name +

        "\n" +

        importantTask.date +
        " • " +
        importantTask.time +

        "\nPriority: " +

        getPriorityName(
            importantTask.priority
        )
    );
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

    const username = getLoggedInUser();

    if (!username) {

        alert("Please log in first.");

        return;
    }

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

                        username: username,

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
                result.message ||
                "The server could not add the reminder."
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
            "Could not connect to the server. Please try again in a moment."
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
        // DELETE BUTTON
        // ==================================

        const deleteButton =
            document.createElement("button");

        deleteButton.textContent = "🗑 Delete";

        deleteButton.className = "delete-btn";

        deleteButton.onclick = function () {

            deleteTask(task.id);
        };

        actions.appendChild(deleteButton);


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

    const username = getLoggedInUser();

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
                `&username=${encodeURIComponent(username)}`,
                {
                    method: "POST"
                }
            );


        if (!response.ok) {

            throw new Error(
                `HTTP ${response.status}`
            );
        }

        const result = await response.json();

        if (!result.success) {

            alert(result.message || "Could not update the reminder.");

            return;
        }


        // Update locally
        task.completed = true;

        task.status = "completed";


        updateStatistics();

        updateNextTask();

        showView(currentView);

    }
    catch (error) {

        console.error(
            "Complete task error:",
            error
        );


        alert(
            "Could not connect to the server."
        );
    }
}


// ==========================================
// DELETE TASK
// ==========================================

async function deleteTask(id) {

    const username = getLoggedInUser();

    const confirmed =
        confirm("Delete this reminder? This cannot be undone.");

    if (!confirmed) {
        return;
    }

    try {

        const response =
            await fetch(
                `${API}/delete?id=${encodeURIComponent(id)}` +
                `&username=${encodeURIComponent(username)}`,
                {
                    method: "POST"
                }
            );

        if (!response.ok) {

            throw new Error(`HTTP ${response.status}`);
        }

        const result = await response.json();

        if (!result.success) {

            alert(result.message || "Could not delete the reminder.");

            return;
        }

        // Remove locally
        tasks = tasks.filter(
            item => String(item.id) !== String(id)
        );

        updateStatistics();

        updateNextTask();

        showView(currentView);

    }
    catch (error) {

        console.error("Delete task error:", error);

        alert("Could not connect to the server.");
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
// CALENDAR (real month grid, 3-month window)
// ==========================================

function formatDateYMD(dateObj) {

    const year = dateObj.getFullYear();

    const month =
        String(dateObj.getMonth() + 1).padStart(2, "0");

    const day =
        String(dateObj.getDate()).padStart(2, "0");

    return `${year}-${month}-${day}`;
}


function isSameMonth(a, b) {

    return (
        a.getFullYear() === b.getFullYear() &&
        a.getMonth() === b.getMonth()
    );
}


function changeCalendarMonth(delta) {

    const today = new Date();

    const candidate = new Date(
        calendarDate.getFullYear(),
        calendarDate.getMonth() + delta,
        1
    );

    const earliest = new Date(
        today.getFullYear(),
        today.getMonth() - 1,
        1
    );

    const latest = new Date(
        today.getFullYear(),
        today.getMonth() + 1,
        1
    );

    // Only last month, this month, and next month are allowed.
    if (candidate < earliest || candidate > latest) {
        return;
    }

    calendarDate = candidate;

    selectedCalendarDay = null;

    renderCalendar();
}


function renderCalendar() {

    const monthLabelEl =
        document.getElementById("calendarMonthLabel");

    const gridEl =
        document.getElementById("calendarGrid");

    const prevBtn =
        document.getElementById("prevMonthBtn");

    const nextBtn =
        document.getElementById("nextMonthBtn");

    if (!gridEl || !monthLabelEl) {
        return;
    }

    const today = new Date();

    const year = calendarDate.getFullYear();
    const month = calendarDate.getMonth();

    const monthNames = [
        "January", "February", "March", "April", "May", "June",
        "July", "August", "September", "October", "November", "December"
    ];

    monthLabelEl.textContent = `${monthNames[month]} ${year}`;

    // Disable navigation past the 3-month window (last, this, next).
    const earliest = new Date(today.getFullYear(), today.getMonth() - 1, 1);
    const latest = new Date(today.getFullYear(), today.getMonth() + 1, 1);
    const prevCandidate = new Date(year, month - 1, 1);
    const nextCandidate = new Date(year, month + 1, 1);

    if (prevBtn) {
        prevBtn.disabled = prevCandidate < earliest;
    }

    if (nextBtn) {
        nextBtn.disabled = nextCandidate > latest;
    }

    // Group tasks by exact date (YYYY-MM-DD) for a quick lookup.
    const tasksByDate = {};

    tasks.forEach(task => {

        if (!tasksByDate[task.date]) {
            tasksByDate[task.date] = [];
        }

        tasksByDate[task.date].push(task);
    });

    gridEl.innerHTML = "";

    // Weekday headers
    ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].forEach(label => {

        const headerCell = document.createElement("div");

        headerCell.className = "calendar-weekday";

        headerCell.textContent = label;

        gridEl.appendChild(headerCell);
    });

    const firstOfMonth = new Date(year, month, 1);
    const startWeekday = firstOfMonth.getDay();
    const daysInMonth = new Date(year, month + 1, 0).getDate();

    // Blank cells before day 1
    for (let i = 0; i < startWeekday; i++) {

        const blank = document.createElement("div");

        blank.className = "calendar-day empty-cell";

        gridEl.appendChild(blank);
    }

    // One cell per real calendar day
    for (let day = 1; day <= daysInMonth; day++) {

        const cellDate = new Date(year, month, day);

        const dateStr = formatDateYMD(cellDate);

        const cell = document.createElement("div");

        cell.className = "calendar-day";

        if (
            cellDate.getFullYear() === today.getFullYear() &&
            cellDate.getMonth() === today.getMonth() &&
            cellDate.getDate() === today.getDate()
        ) {
            cell.classList.add("today");
        }

        if (dateStr === selectedCalendarDay) {
            cell.classList.add("selected");
        }

        const dayNumber = document.createElement("div");

        dayNumber.textContent = day;

        cell.appendChild(dayNumber);

        if (tasksByDate[dateStr] && tasksByDate[dateStr].length > 0) {

            const dot = document.createElement("div");

            dot.className = "dot";

            cell.appendChild(dot);
        }

        cell.onclick = function () {

            selectedCalendarDay = dateStr;

            renderCalendar();

            showCalendarDayDetails(dateStr);
        };

        gridEl.appendChild(cell);
    }

    if (selectedCalendarDay && isSameMonth(calendarDate, new Date(selectedCalendarDay))) {

        showCalendarDayDetails(selectedCalendarDay);
    }
    else {

        const detailsEl = document.getElementById("calendarDayDetails");

        if (detailsEl) {

            detailsEl.innerHTML =
                '<p class="empty">Click a date to see its reminders.</p>';
        }
    }
}


function showCalendarDayDetails(dateStr) {

    const detailsEl =
        document.getElementById("calendarDayDetails");

    if (!detailsEl) {
        return;
    }

    const dayTasks =
        tasks.filter(task => task.date === dateStr);

    const dateObj = new Date(dateStr);

    const niceDate = dateObj.toLocaleDateString(undefined, {
        weekday: "long",
        year: "numeric",
        month: "long",
        day: "numeric"
    });

    if (dayTasks.length === 0) {

        detailsEl.innerHTML =
            `<h3>${niceDate}</h3>` +
            '<p class="empty">No reminders on this day.</p>';

        return;
    }

    let html = `<h3>${niceDate} — ${dayTasks.length} reminder(s)</h3>`;

    dayTasks
        .sort((a, b) => a.time.localeCompare(b.time))
        .forEach(task => {

            html += '<div class="task" style="display:block;">' +
                `<strong>${escapeHtml(task.name)}</strong>` +
                `<p>${escapeHtml(task.time)} • ${getPriorityName(task.priority)}` +
                (task.completed ? " • ✓ Completed" : "") +
                "</p>" +
                "</div>";
        });

    detailsEl.innerHTML = html;
}


function escapeHtml(value) {

    const div = document.createElement("div");

    div.textContent = value == null ? "" : String(value);

    return div.innerHTML;
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


/* =========================================================
   AUTH - SESSION HELPERS
   ========================================================= */

function getLoggedInUser() {

    return localStorage.getItem(AUTH_KEY);
}


function seenKeyFor(username) {

    return `smartReminderSeen_${username.toLowerCase()}`;
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
        document.getElementById("greetingText");

    if (!greetingEl || !username) {
        return;
    }

    const isBrandNewSignup =
        sessionStorage.getItem("smartReminderJustSignedUp") === "1";

    const hasSeenBefore =
        localStorage.getItem(seenKeyFor(username)) === "1";

    if (isBrandNewSignup || !hasSeenBefore) {

        greetingEl.textContent = `Welcome, @${username} 👋`;
    }
    else {

        greetingEl.textContent = `Welcome back, @${username} 👋`;
    }

    localStorage.setItem(seenKeyFor(username), "1");

    sessionStorage.removeItem("smartReminderJustSignedUp");
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

    document.getElementById("loginError").textContent = "";
}


function showSignup() {

    document.getElementById("loginForm").style.display = "none";

    document.getElementById("signupForm").style.display = "block";

    document.getElementById("signupError").textContent = "";
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
            "Please choose your favourite colour and fruit.";

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

        sessionStorage.setItem("smartReminderJustSignedUp", "1");

        localStorage.setItem(AUTH_KEY, result.username);

        showAppScreen(result.username);

        await loadTasks();

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

        // Carry the "seen before" flag over to the new username
        // so the greeting doesn't reset to "Welcome" after a rename.
        if (localStorage.getItem(seenKeyFor(currentUsername)) === "1") {

            localStorage.setItem(seenKeyFor(result.username), "1");
        }

        localStorage.setItem(AUTH_KEY, result.username);

        updateProfileDisplay(result.username);

        closeChangeUsername();

        await loadTasks();

        showView(currentView);

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

    document.getElementById("currentPasswordInput").value = "";
    document.getElementById("newPasswordInput").value = "";
    document.getElementById("passwordChangeError").textContent = "";
}


async function submitChangePassword() {

    const username = getLoggedInUser();

    const currentPassword =
        document.getElementById("currentPasswordInput").value;

    const newPassword =
        document.getElementById("newPasswordInput").value;

    const errorEl =
        document.getElementById("passwordChangeError");

    errorEl.textContent = "";


    if (!currentPassword || !newPassword) {

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
            await fetch(`${API}/update-password`, {

                method: "POST",

                headers: {
                    "Content-Type":
                        "application/x-www-form-urlencoded"
                },

                body:
                    new URLSearchParams({
                        username: username,
                        currentPassword: currentPassword,
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
   FORGOT PASSWORD (from the login screen)
   ========================================================= */

function openForgotPassword() {

    document.getElementById("forgotModal").style.display = "flex";
}


function closeForgotPassword() {

    document.getElementById("forgotModal").style.display = "none";

    document.getElementById("forgotUsername").value = "";
    document.getElementById("forgotFavColor").value = "";
    document.getElementById("forgotFavFruit").value = "";
    document.getElementById("forgotNewPassword").value = "";
    document.getElementById("forgotConfirmPassword").value = "";
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

    const confirmPassword =
        document.getElementById("forgotConfirmPassword").value;

    const errorEl =
        document.getElementById("forgotError");

    errorEl.textContent = "";


    if (!username || !favColor || !favFruit) {

        errorEl.textContent =
            "Please fill all fields.";

        return;
    }

    if (newPassword.length < 6) {

        errorEl.textContent =
            "New password must be at least 6 characters.";

        return;
    }

    if (newPassword !== confirmPassword) {

        errorEl.textContent =
            "Passwords do not match.";

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

        closeForgotPassword();

        alert("Your password has been reset. Please log in.");

        showLogin();

    }
    catch (error) {

        console.error("Forgot password error:", error);

        errorEl.textContent =
            "Could not connect to the server.";
    }
}


/* =========================================================
   UPDATE SECURITY QUESTIONS (while logged in)
   ========================================================= */

function openSecurityModal() {

    closeProfileMenu();

    document.getElementById("securityModal").style.display = "flex";
}


function closeSecurityModal() {

    document.getElementById("securityModal").style.display = "none";

    document.getElementById("securityCurrentPassword").value = "";
    document.getElementById("securityFavColor").value = "";
    document.getElementById("securityFavFruit").value = "";
    document.getElementById("securityChangeError").textContent = "";
}


async function submitSecurityUpdate() {

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


    if (!currentPassword) {

        errorEl.textContent =
            "Please enter your current password.";

        return;
    }

    if (!favColor || !favFruit) {

        errorEl.textContent =
            "Please choose your favourite colour and fruit.";

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
                        currentPassword: currentPassword,
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

        closeSecurityModal();

        alert("Security questions updated.");

    }
    catch (error) {

        console.error("Update security error:", error);

        errorEl.textContent =
            "Could not connect to the server.";
    }
}
