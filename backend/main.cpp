#include <iostream>
#include <vector>
#include <string>
#include <sstream>
#include <algorithm>
#include <cstdlib>
#include <cstring>

#include <sys/socket.h>
#include <netinet/in.h>
#include <unistd.h>

#include "Task.h"

using namespace std;


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
// GET VALUE FROM FORM DATA
// ============================================================

string getValue(
    const string& body,
    const string& key
) {

    string searchKey = key + "=";

    size_t start =
        body.find(searchKey);


    if (start == string::npos) {

        return "";
    }


    start += searchKey.length();


    size_t end =
        body.find("&", start);


    if (end == string::npos) {

        end = body.length();
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
// PROCESS ADD TASK
// ============================================================

string addTask(
    const string& body
) {

    string name =
        getValue(body, "name");

    string date =
        getValue(body, "date");

    string time =
        getValue(body, "time");

    string priorityText =
        getValue(body, "priority");
cout << "DEBUG BODY: " << body << endl;
cout << "DEBUG PRIORITY TEXT: [" << priorityText << "]" << endl;

    int priority =
        stoi(priorityText);


    Task task(
        nextID,
        name,
        date,
        time,
        priority
    );


    nextID++;


    // Add to our DSA Priority Queue

    priorityQueue.push(task);


    // Also keep a copy of all tasks

    allTasks.push_back(task);


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
// GET NEXT IMPORTANT TASK
// ============================================================

string getNextTask() {

    if (priorityQueue.empty()) {

        return
            "{"
            "\"success\":false,"
            "\"message\":\"No reminders\""
            "}";
    }


    Task task =
        priorityQueue.top();


    string result =

        "{"
        "\"success\":true,"
        "\"task\":{"

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

        + "}"
        "}";


    return result;
}


// ============================================================
// GET ALL TASKS
// ============================================================

string getAllTasks() {

    string result =

        "{"
        "\"success\":true,"
        "\"tasks\":[";


    for (int i = 0; i < allTasks.size(); i++) {

        Task task =
            allTasks[i];


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

            + "}";


        if (i < allTasks.size() - 1) {

            result += ",";
        }
    }


    result +=

        "]}";


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


    // Find request body

    size_t bodyPosition =
        request.find("\r\n\r\n");


    


    if (bodyPosition != string::npos) {

        body =
            request.substr(
                bodyPosition + 4
            );
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


    // GET NEXT TASK

    if (
        request.find("GET /next") == 0
    ) {

        string response =
            getNextTask();

        sendResponse(
            client,
            response
        );

        return;
    }


    // GET ALL TASKS

    if (
        request.find("GET /tasks") == 0
    ) {

        string response =
            getAllTasks();

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

    cout << "C++ Server running on:"
         << endl;

    cout << "http://127.0.0.1:8080"
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


    return 0;
}