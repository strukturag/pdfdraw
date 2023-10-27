FROM node:17

ADD . /app
ADD docker/config.js.docker /app/config.js

RUN apt-get update && \
    apt-get install -y --no-install-recommends \
        pdftk \
        python3 \
        python3-pip \
        python3-pypdf2

WORKDIR /app

RUN pip install svglib
RUN npm install

CMD ["node", "server.js"]
