# PDF Annotations for Nextcloud

## Installation

- Clone the repository to the `apps` folder of Nextcloud. Make sure to clone
  recursively with submodules or run `git submodule update --init` afterwards
  to fetch third-party components.
- Execute `make` in the checkout folder to fetch other third-party dependencies.


## Server

The backend server is located in the `server` subfolder, see the `README.md`
there for further information.


## Nginx configuration

Add the following to the nginx server configuration so the `pdfdraw` server
runs behind nginx, utilizing the same SSL settings:

    upstream pdfdraw {
        server 127.0.0.1:8080;
    }

    server {

        ... other configuration for Nextcloud ...

        location /socket.io {
            proxy_pass http://pdfdraw/socket.io;
            proxy_http_version 1.1;
            proxy_set_header Upgrade $http_upgrade;
            proxy_set_header Connection "Upgrade";
            proxy_set_header Host $host;
            proxy_set_header X-Real-IP $remote_addr;
            proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        }

        location /download/ {
            proxy_pass http://pdfdraw/download/;
            proxy_http_version 1.1;
            proxy_set_header Host $host;
            proxy_set_header X-Real-IP $remote_addr;
            proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        }

    }


## Nextcloud configuration

The server address and shared secret can be configured in the Nextcloud admin
settings in section `PDF Annotations`.


## Events

Other apps can override the name that is shown in the list of users currently
annotating a document.

For that the app dispatches an event `OCA\PdfDraw::getDisplayName`. The event
has an argument `displayName` which contains the default display name. Logged
in Nextcloud users will use their display name. All other (anonymous) users
will use an empty name by default (this is shown as `Anonymous` in the list).

Event handlers can listen for the `OCA\PdfDraw::getDisplayName` event and update
the `displayName` argument if they can identify the user by other means.
