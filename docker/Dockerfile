FROM nikolaik/python-nodejs:python3.9-nodejs15

RUN wget -qO- https://github.com/strukturag/pdfdraw/archive/v0.1.2.tar.gz | tar -C /tmp -xvz --strip 1
RUN cp -r /tmp/server /app
ADD config.js.docker /app/config.js

RUN apt-get update || : && apt-get install pdftk python-pypdf2 -y

WORKDIR /app

RUN pip install svglib
RUN npm install 

CMD ["node", "server.js"]