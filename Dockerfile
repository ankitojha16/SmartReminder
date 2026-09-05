FROM gcc:latest

WORKDIR /app

RUN apt-get update && \
    apt-get install -y libpq-dev curl nodejs npm && \
    rm -rf /var/lib/apt/lists/*

COPY package.json package-lock.json ./

RUN npm ci --omit=dev

COPY . .

RUN g++ -std=c++17 -I/usr/include/postgresql backend/main.cpp backend/Task.cpp -o server -lpq

CMD ["./server"]