#include "Task.h"
#include <iostream>

using namespace std;


// Default constructor

Task::Task() {

    id = 0;
    name = "";
    date = "";
    time = "";
    priority = 1;
    completed = false;

}


// Parameterized constructor

Task::Task(
    int id,
    string name,
    string date,
    string time,
    int priority
) {

    this->id = id;
    this->name = name;
    this->date = date;
    this->time = time;
    this->priority = priority;
    this->completed = false;

}


// Display task

void Task::display() const {

    cout << "----------------------------------" << endl;

    cout << "Task: " << name << endl;

    cout << "Date: " << date << endl;

    cout << "Time: " << time << endl;

    cout << "Priority: " << priority << endl;

    cout << "Status: "
         << (completed ? "Completed" : "Pending")
         << endl;

    cout << "----------------------------------" << endl;
}