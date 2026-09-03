// ==========================================
// SMART REMINDER - FRONTEND
// ==========================================

let tasks = [];
let currentView = "dashboard";

 const API = "https://smartreminder-zllc.onrender.com";


// ==========================================
// INITIALIZE
// ==========================================

document.addEventListener("DOMContentLoaded", async () => {
    await loadTasks();
    showDashboard();

    // Close modal when clicking outside it
    window.addEventListener("click", function (event) {
        const modal = document.getElementById("taskModal");

        if (event.target === modal) {
            closeAddTask();
        }
    });
});


// ==========================================
// LOAD TASKS FROM C++ SERVER
// ==========================================

async function loadTasks() {

    try {

        const response = await fetch(`${API}/tasks`);

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
                `${API}/complete?id=${encodeURIComponent(id)}`,
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
});