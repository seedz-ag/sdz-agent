FROM ubuntu:22.04 as base

ARG NODE_VERSION=16

RUN apt-get update -y && \
    apt-get upgrade -y && \
    apt-get install -y curl && \
    curl -sL https://deb.nodesource.com/setup_$NODE_VERSION.x | bash - && \
    apt-get install -y nodejs \
      git \
      cmake

WORKDIR /home/node/app

COPY package*.json ./

RUN npm install -g npm@8.19.2

RUN npm i -g ts-node

RUN npm i

COPY . .

CMD [ "/usr/bin/npm", "run", "start" ]
