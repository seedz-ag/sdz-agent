FROM node:14 as base

WORKDIR /home/node/app

RUN apt-get update && apt-get -y install cmake

COPY package*.json ./

RUN npm i -g ts-node

RUN npm i

RUN cp /home/node/app/node_modules/informixdb/installer/onedb-odbc-driver/lib/cli/* /lib
RUN cp /home/node/app/node_modules/informixdb/installer/onedb-odbc-driver/lib/esql/* /lib

ENV LD_LIBRARY_PATH=/home/node/app/node_modules/sdz-agent-database-oracle/instantclient_21_3/ 
ENV INFORMIXDIR=/home/node/app/node_modules/informixdb/installer/onedb-odbc-driver

COPY . .

CMD [ "/usr/local/bin/ts-node", "./src/superacao.ts" ]