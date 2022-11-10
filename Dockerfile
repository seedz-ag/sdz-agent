FROM node:16-alpine

RUN apk add git

WORKDIR /home/node/app

COPY package*.json ./

RUN npm install -g npm@latest

RUN npm i -g ts-node

RUN npm i

COPY . .

CMD [ "/usr/bin/npm", "run", "start" ]
