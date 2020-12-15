FROM nikolaik/python-nodejs:python3.9-nodejs15

ADD . /app
ADD docker/config.js.docker /app/config.js

RUN apt-get update || : && apt-get install pdftk python-pypdf2 -y

WORKDIR /app

RUN pip install svglib
RUN npm install 

CMD ["node", "server.js"]