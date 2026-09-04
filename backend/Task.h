#ifndef TASK_H
#define TASK_H

#include <string>

using namespace std;

class Task {
public:

    int id;
    string username;   // owner of this reminder (privacy fix)
    string name;
    string date;
    string time;
    int priority;
    bool completed;

    Task();

    Task(
        int id,
        string username,
        string name,
        string date,
        string time,
        int priority
    );

    void display() const;
};

#endif
