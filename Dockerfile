FROM node:20.9.0-alpine

# Run updates
RUN apk update
RUN apk upgrade

# Install dependencies
RUN apk --no-cache add \
  bash \
  build-base \
  gcompat \
  git \
  libc6-compat \
  openvpn \
  python3 \
  unixodbc-dev \
  unzip 

WORKDIR /opt/sdz-agent

COPY . .

RUN npm i -g npm@latest

RUN npm i -g ts-node

RUN npm i 

RUN cp -R ./node_modules/informixdb/installer/onedb-odbc-driver/lib/cli/libthcli.so /lib

RUN cp -R ./node_modules/informixdb/installer/onedb-odbc-driver/lib/esql/libifgl* /lib

ENV INFORMIXDIR=/opt/sdz-agent/node_modules/informixdb/installer/onedb-odbc-driver

ENV LD_LIBRARY_PATH=/opt/sdz-agent/node_modules/sdz-agent-database-oracle/instantclient_21_3/

RUN unzip /opt/sdz-agent/node_modules/sdz-agent-database-oracle/instantclient-basic-linux.x64-21.3.0.0.0.zip -d /opt/sdz-agent/node_modules/sdz-agent-database-oracle/

RUN chmod u+x ./agent

CMD [ "./agent", "scheduler" ]