FROM ubuntu:24.04
#
WORKDIR /opt/sdz-agent

ENV USER=$(/usr/bin/whoami)

# Run updates
RUN apt-get update --fix-missing -y && apt-get install -y

# Install dependencies
RUN apt-get install -y \
  curl \
  build-essential \
  libssl-dev \
  git \
  supervisor \ 
  libaio1t64 \
  libodbc2 \
  unzip \
  sudo \
  openvpn

RUN mkdir -p /var/log/supervisor

# Install NVM
ENV NVM_DIR=/opt/sdz-agent/.nvm
ENV NODE_VERSION=20.16.0
RUN mkdir .nvm
RUN curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.39.5/install.sh | bash 
ENV NODE_PATH $NVM_DIR/v$NODE_VERSION/lib/node_modules
ENV PATH      $NVM_DIR/versions/node/v$NODE_VERSION/bin:$PATH

COPY supervisord.conf /etc/supervisor/conf.d/supervisord.conf

COPY . .

RUN npm i -ci

RUN npm i -g ts-node

RUN cp -R ./node_modules/informixdb/installer/onedb-odbc-driver/lib/cli/libthcli.so /lib
RUN cp -R ./node_modules/informixdb/installer/onedb-odbc-driver/lib/esql/libifgl* /lib
ENV INFORMIXDIR=/opt/sdz-agent/node_modules/informixdb/installer/onedb-odbc-driver

ENV LD_LIBRARY_PATH=/opt/sdz-agent/assets/instantclient_21_3/
RUN unzip /opt/sdz-agent/assets/instantclient-basic-linux.x64-21.3.0.0.0.zip -d /opt/sdz-agent/assets/
RUN ln -s /usr/lib/x86_64-linux-gnu/libaio.so.1t64 /usr/lib/x86_64-linux-gnu/libaio.so.1

RUN chmod u+x ./agent

CMD [ "./agent", "scheduler" ]