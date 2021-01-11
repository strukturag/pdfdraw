# pdfdraw server

This document describes the `pdfdraw` server API.

## Requirements

- node
- npm
- Python2
- [pdftk](https://www.pdflabs.com/tools/pdftk-server/)
- [svg2pdf](https://pypi.org/project/svglib/)
- [PyPDF2](https://pypi.org/project/PyPDF2/) or [pyPdf](https://pypi.org/project/pyPdf/)

`pdftk` should be available as a package `pdftk` or `pdftk-java`.

The `svg2pdf` tool can be installed with

    pip install svglib

Most Linux distributions provide `pyPdf` in a package like `python-pypdf`.


## Preparation

Make sure all requirements are installed and can be executed from the user
running the pdfdraw server.

Install the node dependencies by running `npm install` in the `server` folder.

Copy `config.js.in` to `config.js` and adjust to your requirements.


## Running

The server can be started with `node server.js`, a systemd service script is
provided in `pdfdraw.service`.


## Annotation events

TODO: Describe the socket.io API.


## Downloading PDFs

A client can download annotated PDF documents by sending a HTTP `POST` to the
`download` endpoint.

Request parameters (sent as `application/json`):
- `token` (string): The token used to access the file being annotated.
- `svg` (string): The SVG data containing the annotations.
- `text` (list): Optional list of text annotations to embedd in the PDF.

The text annotations are a list of objects that must contain the following
fields:
- `page` (number): Zero-based page number where the annotation should be added.
  Will default to the first page if nothing is given.
- `x` (number): X position of the annotation.
- `y` (number): Y position of the annotation.
- `text` (string): The annotation text.
- `color` (string): Optional HTML color of the annotation. PDF readers will use
  a default color if none is provided.
- `author` (string): Optional author name to add to the annotation metadata.
- `modified` (number): Optional timestamp (seconds since the epoch, in UTC)
  when the annotation was last modified.

# Run pdfdraw server in a docker container using docker-compose.

All settings are exposed into enviroment variables. That means you are able to config the backend server in [docker-compose.yml](docker-compose.yml.in) yaml file by editing the corresponding enviroment variables.

Save `docker-compose.yml.in` to `docker-compose.yml` and make changes if needed.
Based on your docker setup you still need to edit a few lines in the `docker-compose.yml` file for networking. 

For example by exposing ports:

    ports:  
      - "8080:8080"
 
or join an existing network:

    networks:  
      default:
        external:
           name: my-pre-existing-network

For more details read [Networking in Compose](https://docs.docker.com/compose/networking/)

Than run docker compose.

    docker-compose up -d
