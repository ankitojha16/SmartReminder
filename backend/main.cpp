#include <iostream>
#include <vector>
#include <string>
#include <sstream>
#include <algorithm>
#include <cstdlib>
#include <cstring>
#include <cctype>
#include <functional>

#include <sys/socket.h>
#include <netinet/in.h>
#include <unistd.h>

#include "Task.h"
#include <fstream>
#include <iterator>
#include <cstdio>
#include <sys/stat.h>
#include <cerrno>
#include <libpq-fe.h>

using namespace std;
string getValue(const string& body, const string& key);


// ============================================================
// MAX HEAP PRIORITY QUEUE
// ============================================================

class TaskPriorityQueue {

private:

    vector<Task> heap;


    void heapifyUp(int index) {

        while (index > 0) {

            int parent = (index - 1) / 2;

            if (heap[parent].priority < heap[index].priority) {

                swap(heap[parent], heap[index]);

                index = parent;
            }
            else {

                break;
            }
        }
    }


    void heapifyDown(int index) {

        int size = heap.size();

        while (true) {

            int left = 2 * index + 1;
            int right = 2 * index + 2;

            int largest = index;


            if (
                left < size &&
                heap[left].priority > heap[largest].priority
            ) {

                largest = left;
            }


            if (
                right < size &&
                heap[right].priority > heap[largest].priority
            ) {

                largest = right;
            }


            if (largest != index) {

                swap(heap[index], heap[largest]);

                index = largest;
            }
            else {

                break;
            }
        }
    }


public:

    void push(Task task) {

        heap.push_back(task);

        heapifyUp(heap.size() - 1);
    }


    Task top() {

        if (heap.empty()) {

            return Task();
        }

        return heap[0];
    }


    bool empty() {

        return heap.empty();
    }


    int size() {

        return heap.size();
    }
};


// ============================================================
// GLOBAL DATA
// ============================================================

TaskPriorityQueue priorityQueue;

vector<Task> allTasks;

int nextID = 1;


// ============================================================
// USER ACCOUNT (SIGNUP / LOGIN / SECURITY QUESTIONS)
// ============================================================

struct User {

    string username;
    string passwordHash;
    string favColor;
    string favFruit;
};

vector<User> allUsers;


// Lowercase helper, used so usernames are compared
// case-insensitively (e.g. "Alex" and "alex" are the same user)

string toLower(string value) {

    for (char& c : value) {

        c = static_cast<char>(
            tolower(static_cast<unsigned char>(c))
        );
    }

    return value;
}


// NOTE: this is a simple, non-cryptographic hash used only so
// plain passwords are not stored on disk as-is. It is fine for
// a learning project, but should not be relied on for real
// production security.

string hashPassword(const string& password) {

    hash<string> hasher;

    size_t hashed =
        hasher(password + "smartReminderSalt");

    return to_string(hashed);
}


// Replace any pipe characters, since "|" is our on-disk field
// separator. Keeps a stray "|" typed by a user from corrupting
// the users.txt / tasks.txt file format.

string sanitizeField(string value) {

    for (char& c : value) {

        if (c == '|') {
            c = ' ';
        }
    }

    return value;
}


// ============================================================
// PERSISTENT DATA STORAGE - SUPABASE POSTGRESQL
// ============================================================
// Render's Free filesystem is temporary, so users/tasks/schedule are
// stored in Supabase PostgreSQL instead of users.txt/tasks.txt/schedule.txt.
// DATABASE_URL is supplied through the Render environment variables.

PGconn* database = nullptr;

User* findUser(const string& username) {
    string target = toLower(username);

    for (User& user : allUsers) {
        if (toLower(user.username) == target) {
            return &user;
        }
    }

    return nullptr;
}

bool connectDatabase() {
    const char* url = getenv("DATABASE_URL");

    if (url == nullptr || *url == '\0') {
        cerr << "ERROR: DATABASE_URL environment variable is missing." << endl;
        return false;
    }

    database = PQconnectdb(url);

    if (PQstatus(database) != CONNECTION_OK) {
        cerr << "ERROR: PostgreSQL connection failed: "
             << PQerrorMessage(database) << endl;
        PQfinish(database);
        database = nullptr;
        return false;
    }

    cout << "PostgreSQL database connected successfully." << endl;
    return true;
}

bool executeSQL(const string& sql) {
    if (database == nullptr) {
        return false;
    }

    PGresult* result = PQexec(database, sql.c_str());
    ExecStatusType status = PQresultStatus(result);
    bool ok = (status == PGRES_COMMAND_OK || status == PGRES_TUPLES_OK);

    if (!ok) {
        cerr << "PostgreSQL error: " << PQerrorMessage(database) << endl;
    }

    PQclear(result);
    return ok;
}

PGresult* executeParams(
    const string& sql,
    const vector<string>& values
) {
    if (database == nullptr) {
        return nullptr;
    }

    vector<const char*> params;
    params.reserve(values.size());

    for (const string& value : values) {
        params.push_back(value.c_str());
    }

    return PQexecParams(
        database,
        sql.c_str(),
        static_cast<int>(params.size()),
        nullptr,
        params.empty() ? nullptr : params.data(),
        nullptr,
        nullptr,
        0
    );
}

bool executeParamsCommand(
    const string& sql,
    const vector<string>& values
) {
    PGresult* result = executeParams(sql, values);

    if (result == nullptr) {
        return false;
    }

    bool ok = PQresultStatus(result) == PGRES_COMMAND_OK;

    if (!ok) {
        cerr << "PostgreSQL error: " << PQerrorMessage(database) << endl;
    }

    PQclear(result);
    return ok;
}
// ============================================================
// WEB PUSH SUBSCRIPTIONS
// ============================================================

string savePushSubscription(const string& body) {

    string username = getValue(body, "username");
    string endpoint = getValue(body, "endpoint");
    string p256dh = getValue(body, "p256dh");
    string auth = getValue(body, "auth");

    if (
        username.empty() ||
        endpoint.empty() ||
        p256dh.empty() ||
        auth.empty()
    ) {
        return
            "{\"success\":false,\"message\":\"Push subscription data is incomplete.\"}";
    }

    string sql =
        "INSERT INTO push_subscriptions "
        "(username, endpoint, p256dh, auth) "
        "VALUES ($1, $2, $3, $4) "
        "ON CONFLICT (endpoint) DO UPDATE SET "
        "username = EXCLUDED.username, "
        "p256dh = EXCLUDED.p256dh, "
        "auth = EXCLUDED.auth";

    bool ok = executeParamsCommand(
        sql,
        {
            username,
            endpoint,
            p256dh,
            auth
        }
    );

    if (!ok) {
        return
            "{\"success\":false,\"message\":\"Could not save push subscription.\"}";
    }

    cout << "Push subscription saved for user: "
         << username << endl;

    return
        "{\"success\":true,\"message\":\"Push subscription saved.\"}";
}

string dbValue(PGresult* result, int row, int column) {
    if (PQgetisnull(result, row, column)) {
        return "";
    }
    return PQgetvalue(result, row, column);
}

bool databaseHasRows(const string& table) {
    string sql = "SELECT COUNT(*) FROM " + table;
    PGresult* result = PQexec(database, sql.c_str());

    if (result == nullptr || PQresultStatus(result) != PGRES_TUPLES_OK) {
        if (result != nullptr) PQclear(result);
        return false;
    }

    bool hasRows = atoi(PQgetvalue(result, 0, 0)) > 0;
    PQclear(result);
    return hasRows;
}

void loadUsers() {
    allUsers.clear();

    PGresult* result = PQexec(
        database,
        "SELECT username, password_hash, fav_color, fav_fruit "
        "FROM users ORDER BY id"
    );

    if (result == nullptr || PQresultStatus(result) != PGRES_TUPLES_OK) {
        cerr << "ERROR loading users: " << PQerrorMessage(database) << endl;
        if (result != nullptr) PQclear(result);
        return;
    }

    int rows = PQntuples(result);

    for (int i = 0; i < rows; i++) {
        User user;
        user.username = dbValue(result, i, 0);
        user.passwordHash = dbValue(result, i, 1);
        user.favColor = dbValue(result, i, 2);
        user.favFruit = dbValue(result, i, 3);
        allUsers.push_back(user);
    }

    PQclear(result);
    cout << "Loaded " << allUsers.size() << " users from database." << endl;
}

void saveUsers() {
    if (database == nullptr) return;

    if (!executeSQL("BEGIN")) return;

    if (!executeSQL("DELETE FROM users")) {
        executeSQL("ROLLBACK");
        return;
    }

    bool ok = true;

    for (const User& user : allUsers) {
        ok = executeParamsCommand(
            "INSERT INTO users "
            "(username, password_hash, fav_color, fav_fruit) "
            "VALUES ($1, $2, $3, $4)",
            {user.username, user.passwordHash, user.favColor, user.favFruit}
        );

        if (!ok) break;
    }

    if (ok) {
        executeSQL("COMMIT");
    } else {
        executeSQL("ROLLBACK");
    }
}

bool usernameTaken(const string& username) {
    return findUser(username) != nullptr;
}

// ============================================================
// TASK PERSISTENCE
// ============================================================

void loadTasks() {
    allTasks.clear();
    priorityQueue = TaskPriorityQueue();

    PGresult* result = PQexec(
        database,
        "SELECT id, username, name, date, time, priority, completed "
        "FROM tasks ORDER BY id"
    );

    if (result == nullptr || PQresultStatus(result) != PGRES_TUPLES_OK) {
        cerr << "ERROR loading tasks: " << PQerrorMessage(database) << endl;
        if (result != nullptr) PQclear(result);
        return;
    }

    int rows = PQntuples(result);
    int highestID = 0;

    for (int i = 0; i < rows; i++) {
        Task task;
        task.id = atoi(dbValue(result, i, 0).c_str());
        task.username = dbValue(result, i, 1);
        task.name = dbValue(result, i, 2);
        task.date = dbValue(result, i, 3);
        task.time = dbValue(result, i, 4);
        task.priority = atoi(dbValue(result, i, 5).c_str());
        task.completed = (dbValue(result, i, 6) == "t" ||
                          dbValue(result, i, 6) == "true" ||
                          dbValue(result, i, 6) == "1");

        allTasks.push_back(task);
        priorityQueue.push(task);

        if (task.id > highestID) highestID = task.id;
    }

    nextID = highestID + 1;
    PQclear(result);

    cout << "Loaded " << allTasks.size() << " reminders from database." << endl;
}

void saveTasks() {
    if (database == nullptr) return;

    if (!executeSQL("BEGIN")) return;

    if (!executeSQL("DELETE FROM tasks")) {
        executeSQL("ROLLBACK");
        return;
    }

    bool ok = true;

    for (const Task& task : allTasks) {
        ok = executeParamsCommand(
            "INSERT INTO tasks "
            "(id, username, name, date, time, priority, completed) "
            "VALUES ($1, $2, $3, $4, $5, $6, $7)",
            {
                to_string(task.id),
                task.username,
                task.name,
                task.date,
                task.time,
                to_string(task.priority),
                task.completed ? "true" : "false"
            }
        );

        if (!ok) break;
    }

    if (ok) {
        executeSQL("COMMIT");
    } else {
        executeSQL("ROLLBACK");
    }
}

// ============================================================
// DAILY SCHEDULE (kept completely separate from reminders)
// ============================================================

struct ScheduleTask {
    int id;
    string username;
    string day;
    string name;
    string startTime;
    string endTime;
};

vector<ScheduleTask> allSchedule;
int nextScheduleID = 1;

bool isValidDay(const string& day) {
    static const vector<string> validDays = {
        "mon", "tue", "wed", "thu", "fri", "sat", "sun"
    };

    return find(validDays.begin(), validDays.end(), day) != validDays.end();
}

void loadSchedule() {
    allSchedule.clear();

    PGresult* result = PQexec(
        database,
        "SELECT id, username, day, name, start_time, end_time "
        "FROM schedule ORDER BY id"
    );

    if (result == nullptr || PQresultStatus(result) != PGRES_TUPLES_OK) {
        cerr << "ERROR loading schedule: " << PQerrorMessage(database) << endl;
        if (result != nullptr) PQclear(result);
        return;
    }

    int rows = PQntuples(result);
    int highestID = 0;

    for (int i = 0; i < rows; i++) {
        ScheduleTask item;
        item.id = atoi(dbValue(result, i, 0).c_str());
        item.username = dbValue(result, i, 1);
        item.day = dbValue(result, i, 2);
        item.name = dbValue(result, i, 3);
        item.startTime = dbValue(result, i, 4);
        item.endTime = dbValue(result, i, 5);

        allSchedule.push_back(item);
        if (item.id > highestID) highestID = item.id;
    }

    nextScheduleID = highestID + 1;
    PQclear(result);

    cout << "Loaded " << allSchedule.size() << " schedule items from database." << endl;
}

void saveSchedule() {
    if (database == nullptr) return;

    if (!executeSQL("BEGIN")) return;

    if (!executeSQL("DELETE FROM schedule")) {
        executeSQL("ROLLBACK");
        return;
    }

    bool ok = true;

    for (const ScheduleTask& item : allSchedule) {
        ok = executeParamsCommand(
            "INSERT INTO schedule "
            "(id, username, day, name, start_time, end_time) "
            "VALUES ($1, $2, $3, $4, $5, $6)",
            {
                to_string(item.id),
                item.username,
                item.day,
                item.name,
                item.startTime,
                item.endTime
            }
        );

        if (!ok) break;
    }

    if (ok) {
        executeSQL("COMMIT");
    } else {
        executeSQL("ROLLBACK");
    }
}

// ============================================================
// URL DECODER
// ============================================================

string urlDecode(string value) {

    string result;

    for (int i = 0; i < value.length(); i++) {

        if (value[i] == '+') {

            result += ' ';
        }

        else if (
            value[i] == '%' &&
            i + 2 < value.length()
        ) {

            string hex =
                value.substr(i + 1, 2);

            char character =
                static_cast<char>(
                    strtol(hex.c_str(), nullptr, 16)
                );

            result += character;

            i += 2;
        }

        else {

            result += value[i];
        }
    }

    return result;
}


// ============================================================
// GET VALUE FROM FORM DATA OR QUERY STRING
// ============================================================
// Works for both a POST body ("a=1&b=2") and the query string
// of a GET request line ("GET /tasks?a=1&b=2 HTTP/1.1"), since
// it just looks for "key=" and reads until the next "&".

string getValue(
    const string& body,
    const string& key
) {

    string searchKey = key + "=";
    size_t start = body.find(searchKey);

    while (start != string::npos) {

        // Make sure we matched a real key boundary, not the tail
        // of a longer key name (e.g. "username" inside
        // "newUsername").
        if (
            start == 0 ||
            body[start - 1] == '&' ||
            body[start - 1] == '?'
        ) {
            break;
        }

        start = body.find(searchKey, start + 1);
    }

    if (start == string::npos) {

        return "";
    }


    start += searchKey.length();


    size_t end = body.find("&", start);

    if (end == string::npos) {

        end = body.length();
    }

    // A GET request line also has " HTTP/1.1" trailing after
    // the query string - strip that off if present.
    size_t space = body.find(" ", start);

    if (space != string::npos && space < end) {
        end = space;
    }


    return urlDecode(
        body.substr(
            start,
            end - start
        )
    );
}


// ============================================================
// JSON ESCAPE
// ============================================================

string jsonEscape(string value) {

    string result;

    for (char c : value) {

        if (c == '"') {

            result += "\\\"";
        }

        else if (c == '\\') {

            result += "\\\\";
        }

        else {

            result += c;
        }
    }

    return result;
}


// ============================================================
// HTTP RESPONSE
// ============================================================

void sendResponse(
    int client,
    const string& body
) {

    string response =
        "HTTP/1.1 200 OK\r\n"
        "Content-Type: application/json\r\n"
        "Access-Control-Allow-Origin: *\r\n"
        "Access-Control-Allow-Methods: GET, POST, OPTIONS\r\n"
        "Access-Control-Allow-Headers: Content-Type\r\n"
        "Content-Length: "
        + to_string(body.length())
        + "\r\n"
        "Connection: close\r\n"
        "\r\n"
        + body;


    send(
        client,
        response.c_str(),
        response.length(),
        0
    );
}


// ============================================================
// SIGNUP
// ============================================================

string signupUser(const string& body) {

    string username =
        getValue(body, "username");

    string password =
        getValue(body, "password");

    string favColor =
        getValue(body, "favColor");

    string favFruit =
        getValue(body, "favFruit");


    if (username.empty() || password.empty()) {

        return
            "{\"success\":false,"
            "\"message\":\"Username and password are required.\"}";
    }

    if (favColor.empty() || favFruit.empty()) {

        return
            "{\"success\":false,"
            "\"message\":\"Please choose your favourite colour and fruit.\"}";
    }

    if (password.length() < 6) {

        return
            "{\"success\":false,"
            "\"message\":\"Password must be at least 6 characters.\"}";
    }

    if (usernameTaken(username)) {

        return
            "{\"success\":false,"
            "\"message\":\"That username is already taken. Please choose another.\"}";
    }


    User user;

    user.username = sanitizeField(username);
    user.passwordHash = hashPassword(password);
    user.favColor = sanitizeField(toLower(favColor));
    user.favFruit = sanitizeField(toLower(favFruit));

    allUsers.push_back(user);

    saveUsers();


    return
        "{"
        "\"success\":true,"
        "\"message\":\"Account created successfully.\","
        "\"username\":\"" + jsonEscape(user.username) + "\""
        "}";
}


// ============================================================
// LOGIN
// ============================================================

string loginUser(const string& body) {

    string username =
        getValue(body, "username");

    string password =
        getValue(body, "password");

    User* user = findUser(username);

    if (!user) {

        return
            "{\"success\":false,"
            "\"message\":\"No account found with that username.\"}";
    }

    if (user->passwordHash != hashPassword(password)) {

        return
            "{\"success\":false,"
            "\"message\":\"Incorrect password.\"}";
    }

    return
        "{"
        "\"success\":true,"
        "\"message\":\"Login successful.\","
        "\"username\":\"" + jsonEscape(user->username) + "\""
        "}";
}


// ============================================================
// UPDATE USERNAME
// ============================================================

string updateUsername(const string& body) {

    string currentUsername =
        getValue(body, "currentUsername");

    string newUsername =
        getValue(body, "newUsername");

    string password =
        getValue(body, "password");


    if (newUsername.empty()) {

        return
            "{\"success\":false,"
            "\"message\":\"New username cannot be empty.\"}";
    }

    if (
        toLower(newUsername) != toLower(currentUsername) &&
        usernameTaken(newUsername)
    ) {

        return
            "{\"success\":false,"
            "\"message\":\"That username is already taken.\"}";
    }


    User* user = findUser(currentUsername);

    if (!user) {

        return
            "{\"success\":false,"
            "\"message\":\"User not found.\"}";
    }

    if (user->passwordHash != hashPassword(password)) {

        return
            "{\"success\":false,"
            "\"message\":\"Incorrect password.\"}";
    }

    string oldUsername = user->username;

    user->username = sanitizeField(newUsername);

    saveUsers();

    // Keep every existing reminder attached to the renamed
    // account so nothing "disappears" after a rename.
    for (Task& task : allTasks) {

        if (toLower(task.username) == toLower(oldUsername)) {
            task.username = user->username;
        }
    }

    saveTasks();

    return
        "{"
        "\"success\":true,"
        "\"message\":\"Username updated.\","
        "\"username\":\"" + jsonEscape(user->username) + "\""
        "}";
}


// ============================================================
// UPDATE PASSWORD (while logged in, verified with the security
// questions that were set at signup - same check as the "forgot
// password" flow, since security questions exist only to gate
// changing/resetting a password and are never editable later)
// ============================================================

string updatePassword(const string& body) {

    string username =
        getValue(body, "username");

    string favColor =
        getValue(body, "favColor");

    string favFruit =
        getValue(body, "favFruit");

    string newPassword =
        getValue(body, "newPassword");


    if (favColor.empty() || favFruit.empty()) {

        return
            "{\"success\":false,"
            "\"message\":\"Please answer your security questions.\"}";
    }

    if (newPassword.length() < 6) {

        return
            "{\"success\":false,"
            "\"message\":\"New password must be at least 6 characters.\"}";
    }

    User* user = findUser(username);

    if (!user) {

        return
            "{\"success\":false,"
            "\"message\":\"User not found.\"}";
    }

    bool colorMatches =
        toLower(user->favColor) == toLower(favColor);

    bool fruitMatches =
        toLower(user->favFruit) == toLower(favFruit);

    if (!colorMatches || !fruitMatches) {

        return
            "{\"success\":false,"
            "\"message\":\"Your favourite colour and fruit did not match our records.\"}";
    }

    user->passwordHash = hashPassword(newPassword);

    saveUsers();

    return
        "{\"success\":true,"
        "\"message\":\"Password updated.\"}";
}


// ============================================================
// UPDATE SECURITY QUESTIONS (while logged in, verified with the
// account password - lets a user change their favourite colour /
// fruit answers without needing to know the old ones)
// ============================================================

string updateSecurity(const string& body) {

    string username =
        getValue(body, "username");

    string password =
        getValue(body, "password");

    string favColor =
        getValue(body, "favColor");

    string favFruit =
        getValue(body, "favFruit");


    if (favColor.empty() || favFruit.empty()) {

        return
            "{\"success\":false,"
            "\"message\":\"Please choose your new favourite colour and fruit.\"}";
    }

    User* user = findUser(username);

    if (!user) {

        return
            "{\"success\":false,"
            "\"message\":\"User not found.\"}";
    }

    if (user->passwordHash != hashPassword(password)) {

        return
            "{\"success\":false,"
            "\"message\":\"Incorrect password.\"}";
    }

    user->favColor = sanitizeField(toLower(favColor));
    user->favFruit = sanitizeField(toLower(favFruit));

    saveUsers();

    return
        "{\"success\":true,"
        "\"message\":\"Security questions updated.\"}";
}


// ============================================================
// FORGOT PASSWORD (reset using favourite colour + favourite fruit)
// ============================================================

string forgotPasswordReset(const string& body) {

    string username =
        getValue(body, "username");

    string favColor =
        getValue(body, "favColor");

    string favFruit =
        getValue(body, "favFruit");

    string newPassword =
        getValue(body, "newPassword");


    if (username.empty() || favColor.empty() || favFruit.empty()) {

        return
            "{\"success\":false,"
            "\"message\":\"Please fill all fields.\"}";
    }

    if (newPassword.length() < 6) {

        return
            "{\"success\":false,"
            "\"message\":\"New password must be at least 6 characters.\"}";
    }

    User* user = findUser(username);

    if (!user) {

        return
            "{\"success\":false,"
            "\"message\":\"No account found with that username.\"}";
    }

    bool colorMatches =
        toLower(user->favColor) == toLower(favColor);

    bool fruitMatches =
        toLower(user->favFruit) == toLower(favFruit);

    if (!colorMatches || !fruitMatches) {

        return
            "{\"success\":false,"
            "\"message\":\"Your favourite colour and fruit did not match our records.\"}";
    }

    user->passwordHash = hashPassword(newPassword);

    saveUsers();

    return
        "{\"success\":true,"
        "\"message\":\"Password reset. You can log in now.\"}";
}


// ============================================================
// PROCESS ADD TASK
// ============================================================

string addTask(
    const string& body
) {

    string username =
        getValue(body, "username");

    string name =
        getValue(body, "name");

    string date =
        getValue(body, "date");

    string time =
        getValue(body, "time");

    string priorityText =
        getValue(body, "priority");

    if (username.empty()) {

        return
            "{\"success\":false,"
            "\"message\":\"You must be logged in to add a reminder.\"}";
    }

    // stoi() throws if priorityText is empty or not a number.
    // That exception was uncaught, which crashed the ENTIRE
    // server process (taking down every route, including
    // signup/login, until Render restarted the container).
    // Fall back to a default priority instead of crashing.
    int priority = 1;

    try {
        priority = stoi(priorityText);
    }
    catch (...) {
        priority = 1;
    }


    Task task(
        nextID,
        sanitizeField(username),
        sanitizeField(name),
        sanitizeField(date),
        sanitizeField(time),
        priority
    );


    nextID++;


    // Add to our DSA Priority Queue

    priorityQueue.push(task);


    // Also keep a copy of all tasks, and persist to disk so
    // reminders survive a server restart.

    allTasks.push_back(task);

    saveTasks();


    cout << endl;

    cout << "Task Added:" << endl;

    task.display();


    return
        "{"
        "\"success\":true,"
        "\"message\":\"Task added successfully\","
        "\"id\":" + to_string(task.id)
        + "}";
}


// ============================================================
// COMPLETE TASK (only the owner can complete their own task)
// ============================================================

string completeTask(const string& request) {

    string idText = getValue(request, "id");
    string username = getValue(request, "username");

    int id = atoi(idText.c_str());

    for (Task& task : allTasks) {

        if (task.id == id) {

            if (
                !username.empty() &&
                toLower(task.username) != toLower(username)
            ) {

                return
                    "{\"success\":false,"
                    "\"message\":\"You do not have permission to update this reminder.\"}";
            }

            task.completed = true;

            saveTasks();

            return
                "{\"success\":true,"
                "\"message\":\"Task marked complete.\"}";
        }
    }

    return
        "{\"success\":false,"
        "\"message\":\"Task not found.\"}";
}


// ============================================================
// DELETE TASK (only the owner can delete their own task)
// ============================================================

string deleteTask(const string& request) {

    string idText = getValue(request, "id");
    string username = getValue(request, "username");

    int id = atoi(idText.c_str());

    for (size_t i = 0; i < allTasks.size(); i++) {

        if (allTasks[i].id == id) {

            if (
                !username.empty() &&
                toLower(allTasks[i].username) != toLower(username)
            ) {

                return
                    "{\"success\":false,"
                    "\"message\":\"You do not have permission to delete this reminder.\"}";
            }

            allTasks.erase(allTasks.begin() + i);

            saveTasks();

            return
                "{\"success\":true,"
                "\"message\":\"Reminder deleted.\"}";
        }
    }

    return
        "{\"success\":false,"
        "\"message\":\"Task not found.\"}";
}


// ============================================================
// GET ALL TASKS -- SCOPED TO ONE USER (PRIVACY FIX)
// ============================================================
// Previously this returned every reminder ever created, for
// every user, which is why different accounts all saw the same
// list. Now it only returns reminders owned by the requesting
// username.

string getAllTasks(const string& username) {

    string result =

        "{"
        "\"success\":true,"
        "\"tasks\":[";

    bool first = true;

    for (const Task& task : allTasks) {

        if (
            !username.empty() &&
            toLower(task.username) != toLower(username)
        ) {
            continue;
        }

        if (!first) {
            result += ",";
        }

        first = false;

        result +=

            "{"

            "\"id\":"
            + to_string(task.id)
            + ","

            "\"name\":\""
            + jsonEscape(task.name)
            + "\","

            "\"date\":\""
            + jsonEscape(task.date)
            + "\","

            "\"time\":\""
            + jsonEscape(task.time)
            + "\","

            "\"priority\":"
            + to_string(task.priority)
            + ","

            "\"completed\":"
            + string(task.completed ? "true" : "false")

            + "}";
    }


    result +=

        "]}";


    return result;
}


// ============================================================
// ADD SCHEDULE TASK (Daily Schedule - NOT a reminder)
// ============================================================

string addScheduleTask(const string& body) {

    string username =
        getValue(body, "username");

    string day =
        toLower(getValue(body, "day"));

    string name =
        getValue(body, "name");

    string startTime =
        getValue(body, "startTime");

    string endTime =
        getValue(body, "endTime");


    if (username.empty()) {

        return
            "{\"success\":false,"
            "\"message\":\"You must be logged in.\"}";
    }

    if (!isValidDay(day)) {

        return
            "{\"success\":false,"
            "\"message\":\"Invalid day of week.\"}";
    }

    if (name.empty() || startTime.empty()) {

        return
            "{\"success\":false,"
            "\"message\":\"Task name and start time are required.\"}";
    }


    ScheduleTask item;

    item.id = nextScheduleID++;
    item.username = sanitizeField(username);
    item.day = day;
    item.name = sanitizeField(name);
    item.startTime = sanitizeField(startTime);
    item.endTime = sanitizeField(endTime);

    allSchedule.push_back(item);

    saveSchedule();

    return
        "{"
        "\"success\":true,"
        "\"id\":" + to_string(item.id)
        + "}";
}


// ============================================================
// UPDATE SCHEDULE TASK (only the owner can edit their own task)
// ============================================================

string updateScheduleTask(const string& body) {

    string idText =
        getValue(body, "id");

    string username =
        getValue(body, "username");

    int id = atoi(idText.c_str());

    for (ScheduleTask& item : allSchedule) {

        if (item.id != id) {
            continue;
        }

        if (toLower(item.username) != toLower(username)) {

            return
                "{\"success\":false,"
                "\"message\":\"You do not have permission to edit this task.\"}";
        }

        string name = getValue(body, "name");
        string startTime = getValue(body, "startTime");
        string endTime = getValue(body, "endTime");
        string day = toLower(getValue(body, "day"));

        if (!name.empty()) {
            item.name = sanitizeField(name);
        }

        if (!startTime.empty()) {
            item.startTime = sanitizeField(startTime);
        }

        if (!endTime.empty()) {
            item.endTime = sanitizeField(endTime);
        }

        if (isValidDay(day)) {
            item.day = day;
        }

        saveSchedule();

        return
            "{\"success\":true}";
    }

    return
        "{\"success\":false,"
        "\"message\":\"Schedule task not found.\"}";
}


// ============================================================
// DELETE SCHEDULE TASK (only the owner can delete their own task)
// ============================================================

string deleteScheduleTask(const string& request) {

    string idText = getValue(request, "id");
    string username = getValue(request, "username");

    int id = atoi(idText.c_str());

    for (size_t i = 0; i < allSchedule.size(); i++) {

        if (allSchedule[i].id != id) {
            continue;
        }

        if (toLower(allSchedule[i].username) != toLower(username)) {

            return
                "{\"success\":false,"
                "\"message\":\"You do not have permission to delete this task.\"}";
        }

        allSchedule.erase(allSchedule.begin() + i);

        saveSchedule();

        return
            "{\"success\":true}";
    }

    return
        "{\"success\":false,"
        "\"message\":\"Schedule task not found.\"}";
}


// ============================================================
// GET SCHEDULE -- SCOPED TO ONE USER
// ============================================================

string getSchedule(const string& username) {

    string result =

        "{"
        "\"success\":true,"
        "\"schedule\":[";

    bool first = true;

    for (const ScheduleTask& item : allSchedule) {

        if (
            !username.empty() &&
            toLower(item.username) != toLower(username)
        ) {
            continue;
        }

        if (!first) {
            result += ",";
        }

        first = false;

        result +=

            "{"

            "\"id\":"
            + to_string(item.id)
            + ","

            "\"day\":\""
            + jsonEscape(item.day)
            + "\","

            "\"name\":\""
            + jsonEscape(item.name)
            + "\","

            "\"startTime\":\""
            + jsonEscape(item.startTime)
            + "\","

            "\"endTime\":\""
            + jsonEscape(item.endTime)
            + "\""

            + "}";
    }

    result += "]}";

    return result;
}

// ============================================================
// GEMINI AI PROXY
// ============================================================

string shellEscape(const string& value) {
    string result = "'";
    for (char c : value) {
        if (c == '\'') {
            result += "'\\''";
        } else {
            result += c;
        }
    }
    result += "'";
    return result;
}

string callGemini(const string& body) {

    const char* envKey = getenv("GEMINI_API_KEY");

    if (!envKey || string(envKey).empty()) {
        return "{\"success\":false,\"message\":\"Gemini AI is not configured on the server.\"}";
    }

    string apiKey = envKey;

    string message = getValue(body, "message");

    if (message.empty()) {
        return "{\"success\":false,\"message\":\"Message is required.\"}";
    }

    const string model = "gemini-3.5-flash";

    const string endpoint =
        "https://generativelanguage.googleapis.com/v1beta/models/" +
        model + ":generateContent";

    const string systemPrompt =
        "You are the built-in assistant inside a reminder and daily-schedule app called Smart Reminder. "
        "Only help with planning the user's day, building or adjusting their weekly schedule, and turning "
        "things into reminders. Politely decline anything unrelated to scheduling, reminders, or daily "
        "planning. Keep replies short and practical.\n\n"
        "Whenever the user asks you to build or change a day plan or schedule, end your reply with a "
        "fenced block exactly like this:\n"
        "```schedule\n"
        "[{\"day\":\"mon\",\"name\":\"Wake up\",\"start\":\"06:00\",\"end\":\"06:15\"}]\n"
        "```\n"
        "Use lowercase three-letter day codes, 24-hour HH:MM times, and one object per task. "
        "Only include the day(s) the user actually asked about. "
        "If you are not proposing a schedule, omit the fenced block.";

    string jsonBody =
        "{\"systemInstruction\":{\"parts\":[{\"text\":\"" +
        jsonEscape(systemPrompt) +
        "\"}]},\"contents\":[{\"role\":\"user\",\"parts\":[{\"text\":\"" +
        jsonEscape(message) +
        "\"}]}]}";

    string command =
        "curl -sS --max-time 60 -X POST " +
        shellEscape(endpoint) +
        " -H " + shellEscape("Content-Type: application/json") +
        " -H " + shellEscape("x-goog-api-key: " + apiKey) +
        " --data-binary " + shellEscape(jsonBody);

    FILE* pipe = popen(command.c_str(), "r");

    if (!pipe) {
        return "{\"success\":false,\"message\":\"Could not start Gemini service.\"}";
    }

    string result;
    char buffer[4096];

    while (fgets(buffer, sizeof(buffer), pipe) != nullptr) {
        result += buffer;

        if (result.size() > 1024 * 1024) {
            break;
        }
    }

    int exitCode = pclose(pipe);

    if (exitCode != 0 || result.empty()) {
        return "{\"success\":false,\"message\":\"Could not reach Gemini service.\"}";
    }

    return result;
}
// ============================================================
// HANDLE HTTP REQUEST
// ============================================================

void handleRequest(
    int client
) {

    char buffer[8192];

memset(buffer, 0, sizeof(buffer));

string request;

// Read the HTTP request
while (true) {
    int bytesRead = recv(
        client,
        buffer,
        sizeof(buffer) - 1,
        0
    );

    if (bytesRead <= 0) {
        return;
    }

    buffer[bytesRead] = '\0';
    request += buffer;

    // Check whether we have received the complete HTTP header
    size_t headerEnd = request.find("\r\n\r\n");

    if (headerEnd == string::npos) {
        continue;
    }

    // Find Content-Length
    size_t contentLengthPos = request.find("Content-Length:");

    if (contentLengthPos == string::npos) {
        contentLengthPos = request.find("content-length:");
    }

    // GET / OPTIONS requests normally have no body
    if (contentLengthPos == string::npos) {
        break;
    }

    // Find the end of the Content-Length line
    size_t lineEnd = request.find(
        "\r\n",
        contentLengthPos
    );

    if (lineEnd == string::npos) {
        continue;
    }

    // Extract Content-Length value
    string lengthText = request.substr(
        contentLengthPos + 15,
        lineEnd - (contentLengthPos + 15)
    );

    // Remove spaces
    size_t first = lengthText.find_first_not_of(" \t");
    if (first != string::npos) {
        lengthText = lengthText.substr(first);
    }

    int contentLength = atoi(lengthText.c_str());

    // Body begins after \r\n\r\n
    size_t bodyStart = headerEnd + 4;

    size_t bodyReceived = request.length() - bodyStart;

    // Keep receiving until the complete body has arrived
    if (bodyReceived >= static_cast<size_t>(contentLength)) {
        break;
    }
}

// Extract the body
string body = "";

size_t headerEnd = request.find("\r\n\r\n");

if (headerEnd != string::npos) {
    size_t bodyStart = headerEnd + 4;

    body = request.substr(bodyStart);
}

    // Log exactly what request line came in. If a route ever
    // falls through to "Unknown request" again, this line in
    // the Render logs will show precisely what the server saw
    // (helpful if a proxy/browser sends something unexpected).
    string firstLine;
    {
        size_t firstLineEnd = request.find("\r\n");
        firstLine =
            (firstLineEnd == string::npos)
                ? request
                : request.substr(0, firstLineEnd);

        cout << "REQUEST: " << firstLine << endl;
    }


    // Handle browser CORS request

    if (
        request.find("OPTIONS") == 0
    ) {

        sendResponse(
            client,
            "{\"success\":true}"
        );

        return;
    }
    // Serve frontend files
if (request.find("GET /style.css") == 0) {

    ifstream file("frontend/style.css");

    if (!file.is_open()) {
        sendResponse(
            client,
            "{\"success\":false,\"message\":\"style.css not found\"}"
        );
        return;
    }

    string content(
        (istreambuf_iterator<char>(file)),
        istreambuf_iterator<char>()
    );

    string response =
        "HTTP/1.1 200 OK\r\n"
        "Content-Type: text/css\r\n"
        "Content-Length: " + to_string(content.size()) + "\r\n"
        "Access-Control-Allow-Origin: *\r\n"
        "Connection: close\r\n"
        "\r\n" +
        content;

    send(client, response.c_str(), response.size(), 0);
    return;
}

if (request.find("GET /script.js") == 0) {

    ifstream file("frontend/script.js");

    if (!file.is_open()) {
        sendResponse(
            client,
            "{\"success\":false,\"message\":\"script.js not found\"}"
        );
        return;
    }

    string content(
        (istreambuf_iterator<char>(file)),
        istreambuf_iterator<char>()
    );

    string response =
        "HTTP/1.1 200 OK\r\n"
        "Content-Type: application/javascript\r\n"
        "Content-Length: " + to_string(content.size()) + "\r\n"
        "Access-Control-Allow-Origin: *\r\n"
        "Connection: close\r\n"
        "\r\n" +
        content;

    send(client, response.c_str(), response.size(), 0);
    return;
}

if (request.find("GET / HTTP") == 0) {

    ifstream file("frontend/index.html");

    if (!file.is_open()) {
        sendResponse(
            client,
            "{\"success\":false,\"message\":\"index.html not found\"}"
        );
        return;
    }

    string content(
        (istreambuf_iterator<char>(file)),
        istreambuf_iterator<char>()
    );

    string response =
        "HTTP/1.1 200 OK\r\n"
        "Content-Type: text/html\r\n"
        "Content-Length: " + to_string(content.size()) + "\r\n"
        "Access-Control-Allow-Origin: *\r\n"
        "Connection: close\r\n"
        "\r\n" +
        content;

    send(client, response.c_str(), response.size(), 0);
    return;
}
// SAVE WEB PUSH SUBSCRIPTION

if (
    request.find("POST /push/subscribe") == 0
) {

    string response =
        savePushSubscription(body);

    sendResponse(
        client,
        response
    );

    return;
}

    // SIGNUP

    if (
        request.find("POST /signup") == 0
    ) {

        string response =
            signupUser(body);

        sendResponse(
            client,
            response
        );

        return;
    }


    // LOGIN

    if (
        request.find("POST /login") == 0
    ) {

        string response =
            loginUser(body);

        sendResponse(
            client,
            response
        );

        return;
    }


    // UPDATE USERNAME

    if (
        request.find("POST /update-username") == 0
    ) {

        string response =
            updateUsername(body);

        sendResponse(
            client,
            response
        );

        return;
    }


    // UPDATE PASSWORD

    if (
        request.find("POST /update-password") == 0
    ) {

        string response =
            updatePassword(body);

        sendResponse(
            client,
            response
        );

        return;
    }


    // UPDATE SECURITY QUESTIONS

    if (
        request.find("POST /update-security") == 0
    ) {

        string response =
            updateSecurity(body);

        sendResponse(
            client,
            response
        );

        return;
    }


    // FORGOT PASSWORD (reset via security questions)

    if (
        request.find("POST /forgot-reset") == 0
    ) {

        string response =
            forgotPasswordReset(body);

        sendResponse(
            client,
            response
        );

        return;
    }


    // ADD TASK

    if (
        request.find("POST /add") == 0
    ) {

        string response =
            addTask(body);

        sendResponse(
            client,
            response
        );

        return;
    }


    // COMPLETE TASK

    if (
        request.find("POST /complete") == 0 ||
        request.find("GET /complete") == 0
    ) {

        string response =
            completeTask(firstLine);

        sendResponse(
            client,
            response
        );

        return;
    }


    // DELETE TASK

    if (
        request.find("POST /delete") == 0 ||
        request.find("GET /delete") == 0
    ) {

        string source =
            request.find("POST /delete") == 0
                ? body
                : firstLine;

        string response =
            deleteTask(source);

        sendResponse(
            client,
            response
        );

        return;
    }


    // GET ALL TASKS FOR THE LOGGED-IN USER (PRIVACY FIX)

    if (
        request.find("GET /tasks") == 0
    ) {

        string username =
            getValue(firstLine, "username");

        string response =
            getAllTasks(username);

        sendResponse(
            client,
            response
        );

        return;
    }


    // ADD SCHEDULE TASK (Daily Schedule, separate from reminders)

    if (
        request.find("POST /schedule/add") == 0
    ) {

        string response =
            addScheduleTask(body);

        sendResponse(
            client,
            response
        );

        return;
    }


    // UPDATE SCHEDULE TASK

    if (
        request.find("POST /schedule/update") == 0
    ) {

        string response =
            updateScheduleTask(body);

        sendResponse(
            client,
            response
        );

        return;
    }


    // DELETE SCHEDULE TASK
    // (must be checked before the generic "GET /schedule" route
    // below, since that route would otherwise also match this
    // path's "GET /schedule/delete" prefix)

    if (
        request.find("POST /schedule/delete") == 0 ||
        request.find("GET /schedule/delete") == 0
    ) {

        string source =
            request.find("POST /schedule/delete") == 0
                ? body
                : firstLine;

        string response =
            deleteScheduleTask(source);

        sendResponse(
            client,
            response
        );

        return;
    }


    // GET SCHEDULE FOR THE LOGGED-IN USER

    if (
        request.find("GET /schedule") == 0
    ) {

        string username =
            getValue(firstLine, "username");

        string response =
            getSchedule(username);

        sendResponse(
            client,
            response
        );

        return;
    }

// ============================================================
// GEMINI AI CHAT
// ============================================================

if (request.find("POST /ai-chat") == 0) {

    string response = callGemini(body);

    sendResponse(
        client,
        response
    );

    return;
}
    // UNKNOWN REQUEST

    sendResponse(
        client,
        "{\"success\":false,\"message\":\"Unknown request\"}"
    );
}


// ============================================================
// MAIN SERVER
// ============================================================

int main() {

    if (!connectDatabase()) {
        return 1;
    }

    loadUsers();
    loadTasks();
    loadSchedule();

    int serverSocket =
        socket(
            AF_INET,
            SOCK_STREAM,
            0
        );


    if (serverSocket < 0) {

        cerr << "Error creating socket." << endl;

        return 1;
    }


    int option = 1;


    setsockopt(
        serverSocket,
        SOL_SOCKET,
        SO_REUSEADDR,
        &option,
        sizeof(option)
    );


    sockaddr_in serverAddress{};


    serverAddress.sin_family =
        AF_INET;


    serverAddress.sin_addr.s_addr =
        INADDR_ANY;


const char* portEnv = getenv("PORT");
int port = portEnv ? atoi(portEnv) : 8080;

serverAddress.sin_port =
    htons(port);


    if (
        ::bind(
            serverSocket,
            (struct sockaddr*)&serverAddress,
            sizeof(serverAddress)
        ) < 0
    ) {

        cerr << "Error binding server." << endl;

        close(serverSocket);

        return 1;
    }


    if (
        listen(
            serverSocket,
            10
        ) < 0
    ) {

        cerr << "Error starting server." << endl;

        close(serverSocket);

        return 1;
    }


    cout << endl;

    cout << "===================================="
         << endl;

    cout << "       SMART REMINDER SERVER"
         << endl;

    cout << "===================================="
         << endl;

    cout << endl;

    cout << "C++ Server running on port "
         << port
         << endl;

    cout << endl;

    cout << "DSA: Max Heap / Priority Queue"
         << endl;

    cout << endl;


    while (true) {

        sockaddr_in clientAddress{};

        socklen_t clientLength =
            sizeof(clientAddress);


        int client =
            accept(
                serverSocket,
                (struct sockaddr*)&clientAddress,
                &clientLength
            );


        if (client < 0) {

            continue;
        }


        handleRequest(client);


        close(client);
    }


    close(serverSocket);

    if (database != nullptr) {
        PQfinish(database);
        database = nullptr;
    }

    return 0;
}
