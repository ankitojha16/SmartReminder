FROM gcc:latest

WORKDIR /app

RUN apt-get update && \
    apt-get install -y libpq-dev && \
    rm -rf /var/lib/apt/lists/*

COPY . .

RUN g++ -std=c++17 backend/main.cpp backend/Task.cpp -o server -lpq

CMD ["./server"]