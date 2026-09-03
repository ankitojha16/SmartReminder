FROM gcc:latest

WORKDIR /app

COPY . .

RUN g++ -std=c++17 backend/main.cpp backend/Task.cpp -o server

CMD ["./server"]