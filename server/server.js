/**
 * @copyright Copyright (C) 2018, struktur AG
 *
 * @author Joachim Bauch <mail@joachim-bauch.de>
 *
 * @license AGPL-3.0
 *
 * This program is free software: you can redistribute it and/or modify
 * it under the terms of the GNU Affero General Public License as
 * published by the Free Software Foundation, either version 3 of the
 * License, or (at your option) any later version.
 *
 * This program is distributed in the hope that it will be useful,
 * but WITHOUT ANY WARRANTY; without even the implied warranty of
 * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
 * GNU Affero General Public License for more details.
 *
 * You should have received a copy of the GNU Affero General Public License
 * along with this program.  If not, see <https://www.gnu.org/licenses/>.
 */
"use strict";

var process = require('process');

var config;
try {
  config = require('./config');
} catch (e) {
  if (e.code !== 'MODULE_NOT_FOUND') {
    throw e;
  }

  console.log('Could not load "config.js":', e.code);
  console.log('Please make sure to copy "config.js.in" to "config.js" and adjust to your environment.');
  process.exit(1);
}

var port = config.port || 8080;
var secret = config.secret || '';

var child_process = require('child_process');
var fs = require('fs');
var path = require('path');
var https = require('https');
var http = require('http');
var jwt = require('jsonwebtoken');
var os = require('os');
var socketio = require('socket.io');
var querystring = require('querystring');
var url = require('url');

if (config.use_auto_ecdh_curve) {
  // See https://github.com/nodejs/node/issues/21513#issuecomment-399790415
  require("tls").DEFAULT_ECDH_CURVE = "auto";
}

if (config.allow_invalid_certificates) {
  console.log('WARNING: Invalid certificates are allowed!');
  process.env["NODE_TLS_REJECT_UNAUTHORIZED"] = 0;
}

var CMD_PDFTK = config.cmd_pdftk || 'pdftk';
console.log('Using', CMD_PDFTK, 'to run as pdftk');
var CMD_SVG2PDF = config.cmd_svg2pdf || 'svg2pdf';
console.log('Using', CMD_SVG2PDF, 'to run as svg2pdf');

var PERMISSION_CREATE = 4;
var PERMISSION_READ = 1;
var PERMISSION_UPDATE = 2;
var PERMISSION_DELETE = 8;
var PERMISSION_SHARE = 16;
var PERMISSION_ALL = 31;

function isEmpty(obj) {
  return Object.keys(obj).length === 0 && obj.constructor === Object;
}

function parse_url(s) {
  if (url.hasOwnProperty('URL')) {
    return new url.URL(s);
  } else {
    return url.parse(s);
  }
}

function performOcsRequest(token, request_url, body, method) {
  return new Promise(function(resolve, reject) {
    var u = parse_url(request_url);
    var headers = {
      "Accept": "application/json",
      "Authorization": "Bearer " + token,
      "OCS-APIRequest": "true"
    };
    var options = {
      "hostname": u.hostname,
      "port": u.port,
      "path": u.pathname,
      "headers": headers
    };
    if (body) {
      options.method = method ? method : "POST";
      if (typeof(body) !== "string") {
        body = querystring.stringify(body);
      }
      headers["Content-Type"] = "application/x-www-form-urlencoded";
      // "Transfer-Encoding: chunked" doesn't seem to work.
      headers["Content-Length"] = body.length;
    } else {
      options.method = method ? method : "GET";
    }

    var req = https.request(options, function(response) {
      var data = [];
      response.on('data', function(chunk) {
        data.push(chunk);
      });

      response.on('end', function() {
        if (data.length) {
          data = Buffer.concat(data).toString("utf-8");
        }

        var ct = response.headers['content-type'];
        if (ct && ct.indexOf("application/json") === 0) {
          data = JSON.parse(data);
        }

        if (response.statusCode !== 200) {
          return reject({
            "code": response.statusCode,
            "data": data,
            "headers": response.headers
          });
        }

        if (!data || typeof(data) === "string" || !data.hasOwnProperty("ocs") ||
            !data.ocs.hasOwnProperty("meta") || !data.ocs.hasOwnProperty("data")) {
          return reject({
            "code": response.statusCode,
            "data": data,
            "headers": response.headers,
            "msgid": "invalid_response"
          });
        }

        var meta = data.ocs.meta;
        if (meta.status !== "ok" || meta.statuscode !== 200) {
          return reject({
            "code": meta.statusCode,
            "data": data,
            "headers": response.headers
          });
        }

        resolve(data.ocs.data);
      });
    });

    req.on("error", function(error) {
      reject({
        "error": error
      });
    });
    if (body) {
      req.write(body);
    }
    req.end();
  });
}

var Room = function(io, id, base_url) {
  this.io = io;
  this.room_io = io.to(id);
  this.id = id;
  this.base_url = base_url;
  this.ocs_url = base_url + '/ocs/v2.php/apps/pdfdraw';
  this.users = {};
  this.items = [];
  this.currentPage = null;
  this.loadItems();
};

Room.prototype.isEmpty = function() {
  return isEmpty(this.users);
};

Room.prototype.createToken = function() {
  var token = jwt.sign({
    iss: 'backend',
    exp: Math.floor(Date.now() / 1000) + 300,  // 5 minutes
    file: this.id,
  }, secret, {'algorithm': 'HS256'});
  return token;
};

Room.prototype.loadItems = function() {
  var request_url = this.ocs_url + "/api/v1/item/" + this.id;
  var token = this.createToken();
  performOcsRequest(token, request_url).then(function(items) {
    console.log("Received items", items);
    for (var i = 0; i < items.length; i++) {
      var item = items[i];
      this._addItem(item.name, item.page, item.data);
    }
    this.sendItems();
  }.bind(this), function(error) {
    console.log("Error receiving items", error);
  }.bind(this));
};

Room.prototype._storeItem = function(page, name, data) {
  var request_url = this.ocs_url + "/api/v1/item/" + this.id + "/" + page + "/" + encodeURIComponent(name);
  var body = {
    "data": data
  };
  var token = this.createToken();
  performOcsRequest(token, request_url, body).then(function() {
    console.log("Saved item", name);
  }.bind(this), function(error) {
    console.log("Error saving item", name, error);
  }.bind(this));
};

Room.prototype._removeItem = function(page, name) {
  var request_url = this.ocs_url + "/api/v1/item/" + this.id + "/" + page + "/" + encodeURIComponent(name);
  var token = this.createToken();
  performOcsRequest(token, request_url, null, "DELETE").then(function() {
    console.log("Removed item", name);
  }.bind(this), function(error) {
    console.log("Error removing item", name, error);
  }.bind(this));
};

Room.prototype.send = function(socket, type, message) {
  socket.to(this.id).emit(type, message);
};

Room.prototype.sendMessage = function(socket, message) {
  this.send(socket, 'message', message);
};

Room.prototype._addItem = function(name, page, data) {
  var items;
  if (!this.items.hasOwnProperty(page)) {
    items = this.items[page] = {};
  } else {
    items = this.items[page];
  }
  items[name] = data;
};

Room.prototype.addItem = function(socket, name, page, data) {
  if (!this.userMayModify(socket)) {
    return false;
  }

  this._addItem(name, page, data);
  this._storeItem(page, name, data);
  return true;
};

Room.prototype.removeItem = function(socket, name, page) {
  if (!this.userMayModify(socket)) {
    return false;
  }

  var items;
  if (!this.items.hasOwnProperty(page)) {
    return true;
  }

  items = this.items[page];
  delete items[name];
  this._removeItem(page, name);
  if (isEmpty(items)) {
    delete this.items[page];
  }
  return true;
};

Room.prototype.sendItem = function(socket, name, page, data) {
  var message = {
    'type': 'item',
    'item': {
      'page': page,
      'name': name,
      'data': data
    }
  };
  socket.emit("message", message);
};

Room.prototype.sendItems = function(socket) {
  for (var page in this.items) {
    if (!this.items.hasOwnProperty(page)) {
      continue;
    }

    var items = this.items[page];
    for (var name in items) {
      if (!items.hasOwnProperty(name)) {
        continue;
      }

      if (!socket) {
        for (var userid in this.users) {
          if (!this.users.hasOwnProperty(userid)) {
            continue;
          }
          this.sendItem(this.io.to(userid), name, page, items[name]);
        }
      } else {
        this.sendItem(socket, name, page, items[name]);
      }
    }
  }
};

Room.prototype.handleControl = function(socket, message) {
  if (!this.userMayModify(socket)) {
    return false;
  }

  var control = message.control;
  if (!control || !control.type) {
    console.log('ignore invalid control message', message);
    return false;
  }

  switch (control.type) {
    case 'page':
      var page = control.page;
      console.log('room switched page', this.id, page);
      this.currentPage = page;
      break;
    default:
      console.log('ignore unsupported control message', message);
      return false;
  }

  return true;
};

Room.prototype.addUser = function(socket, data) {
  data.userid = socket.id;
  console.log('user joined room', this.id, data);
  this.send(socket, 'user.joined', [data]);
  this.users[socket.id] = data;
  var all_users = [];
  for (var userid in this.users) {
    if (!this.users.hasOwnProperty(userid)) {
      continue;
    }
    all_users.push(this.users[userid]);
  }
  socket.emit('user.joined', all_users);
  this.sendItems(socket);
  if (this.currentPage) {
    socket.emit("message", {
      'type': 'control',
      'control': {
        'type': 'page',
        'page': this.currentPage
      }
    });
  }
};

Room.prototype.removeUser = function(socket) {
  if (!this.users.hasOwnProperty(socket.id)) {
    return;
  }

  var data = this.users[socket.id];
  console.log('user left room', this.id, data);
  delete this.users[socket.id];
  this.send(socket, 'user.left', data);
};

Room.prototype.userMayModify = function(socket) {
  if (!this.users.hasOwnProperty(socket.id)) {
    return false;
  }

  var userdata = this.users[socket.id];
  if (userdata.permissions == null) {
    // Old-style user with an old token.
    return false;
  }

  return (userdata.permissions & PERMISSION_UPDATE) === PERMISSION_UPDATE;
};

Room.prototype.downloadFile = function(token) {
  return new Promise(function(resolve, reject) {
    var u = parse_url(this.base_url + '/apps/pdfdraw/download/' + this.id);
    var options = {
      "hostname": u.hostname,
      "port": u.port,
      "method": "GET",
      "path": u.pathname,
      "headers": {
        "Authorization": "Bearer " + token,
      }
    };

    var req = https.request(options, function(response) {
      var data = [];
      response.on('data', function(chunk) {
        data.push(chunk);
      });

      response.on('end', function() {
        if (response.statusCode !== 200) {
          return reject({
            "code": response.statusCode,
            "data": data,
            "headers": response.headers
          });
        }

        resolve(Buffer.concat(data));
      });
    });

    req.on("error", function(error) {
      reject({
        "error": error
      });
    });
    req.end();
  }.bind(this));
};

var rooms = {};

function svg2pdf(svg_filename) {
  return new Promise(function(resolve, reject) {
    var cmd = CMD_SVG2PDF;
    console.log("Converting", svg_filename, "to pdf ...");
    var options = {};
    child_process.execFile(cmd, [svg_filename], options, function(error, stdout, stderr) {
      if (error) {
        console.log("Converting", svg_filename, "returned an error", error);
        if (stderr) {
          console.log(CMD_SVG2PDF, "returned an error", error.message, stderr.toString());
        } else {
          console.log(CMD_SVG2PDF, "returned an error", error.message);
        }
        reject(error);
        return;
      }

      var pdf_filename = svg_filename.substr(0, svg_filename.length - 4) + ".pdf";
      if (!fs.existsSync(pdf_filename)) {
        reject(new Error("Converting " + svg_filename + " didn't produce a file"));
        return;
      }

      console.log("Finished converting", svg_filename);
      resolve(pdf_filename);
    });
  });
}

function spawn(cmd, args, options) {
  return new Promise((resolve, reject) => {
    let stdin;
    if (options && options.input) {
      stdin = options.input;
      delete options.input;
    }

    const proc = child_process.spawn(cmd, args, options);
    if (stdin) {
      proc.stdin.write(stdin, (error) => {
        proc.stdin.end();
      });
    }

    let data;
    let errorData;

    proc.on("message", console.log);

    proc.stdout.on("data", chunk => {
      if (!data) {
        data = chunk;
      } else {
        data = Buffer.concat([data, chunk]);
      }
    });

    proc.stderr.on("data", chunk => {
      if (!errorData) {
        errorData = chunk;
      } else {
        errorData = Buffer.concat([errorData, chunk]);
      }
    });

    proc.on("close", function(code) {
      resolve({
        "status": code,
        "stdout": data,
        "stderr": errorData,
      });
    });

    proc.on("error", function(err) {
      reject(err);
    });
  });
}

async function combine_pdfs(pages, filename) {
  if (!pages.length) {
    return false;
  }

  var cmd = CMD_PDFTK;
  console.log("Combining pages ...");
  var args = pages.splice(0);
  args.push("cat");
  args.push("output");
  args.push(filename);
  var status = await spawn(cmd, args);
  console.log("Done", status.status);
  if (status.status !== 0) {
    if (status.stderr) {
      console.log(CMD_PDFTK, "returned an error when combining", status.stderr.toString());
    } else {
      console.log(CMD_PDFTK, "returned an error when combining", status);
    }
    return false;
  }

  // TODO(jojo): Check if file has been created and is non-empty.
  return true;
}

async function overlay_pdf(source_pdf, overlay_filename) {
  if (!overlay_filename) {
    return source_pdf;
  }

  var cmd = CMD_PDFTK;
  console.log("Merging combined with overlay ...");
  var args = ["-", "multistamp", overlay_filename, "output", "-"];
  var status = await spawn(cmd, args, {
    "input": source_pdf,
  });
  console.log("Done", status.status);
  if (status.status !== 0) {
    if (status.stderr) {
      console.log(CMD_PDFTK, "returned an error when merging", status.stderr.toString());
    } else {
      console.log(CMD_PDFTK, "returned an error when merging", status);
    }
    return null;
  }

  var merged = status.stdout;
  if (!merged.length) {
    console.log(CMD_PDFTK, "didn't return a PDF when merging");
    return null;
  }
  return merged;
}

async function add_text_annotations(source_pdf, text, tempdir) {
  if (!text || !text.length) {
    return source_pdf;
  }

  var cmd = __dirname + "/pdfannotate";
  console.log("Adding " + text.length + " text annotations ...");

  var text_filename = tempdir + "/text-annotations.json";
  fs.writeFileSync(text_filename, JSON.stringify(text));

  var args = ["--text", text_filename, "-", "-"];
  var status = await spawn(cmd, args, {
    "input": source_pdf,
  });
  console.log("Done", status.status);
  if (status.status !== 0) {
    if (status.stderr) {
      console.log("Adding text annotations returned an error", status.stderr.toString());
    } else {
      console.log("Adding text annotations returned an error", status);
    }
    return source_pdf;
  }

  var annotated = status.stdout;
  if (!annotated.length) {
    console.log("Adding text annotations didn't return a PDF");
    return source_pdf;
  }

  return annotated;
}

// mktemp code taken from https://github.com/sasaplus1/mktemp/ (MIT license)
/**
 * random table string and table length.
 */
var TABLE = '0123456789abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ';
var TABLE_LEN = TABLE.length;

/**
 * generate random string from template.
 *
 * replace for placeholder "X" in template.
 * return template if not has placeholder.
 *
 * @param {String} template template string.
 * @throws {TypeError} if template is not a String.
 * @return {String} replaced string.
 */
function generate_randomstring(template) {
  var match, i, len, result;

  if (typeof template !== 'string') {
    throw new TypeError('template must be a String: ' + template);
  }

  match = template.match(/(X+)[^X]*$/);

  // return template if not has placeholder
  if (match === null) {
    return template;
  }

  // generate random string
  for (result = '', i = 0, len = match[1].length; i < len; ++i) {
    result += TABLE[Math.floor(Math.random() * TABLE_LEN)];
  }

  // concat template and random string
  return template.slice(0, match.index) + result +
      template.slice(match.index + result.length);
}

/**
 * sync version createDir.
 *
 * @param {String} template template string for dirname.
 * @return {String} created dirname.
 */
function createDirSync(template) {
  var isExist, dirname;

  // FIXME: infinite loop
  do {
    isExist = false;
    dirname = generate_randomstring(template);
    try {
      fs.mkdirSync(dirname, 448 /*=0700*/);
    } catch (e) {
      if (e.code === 'EEXIST') {
        isExist = true;
      } else {
        throw e;
      }
    }
  } while (isExist);

  return dirname;
}

// From https://stackoverflow.com/a/32197381
var deleteFolderRecursive = function(path) {
  if (fs.existsSync(path)) {
    fs.readdirSync(path).forEach(function(file, index) {
      var curPath = path + "/" + file;
      if (fs.lstatSync(curPath).isDirectory()) { // recurse
        deleteFolderRecursive(curPath);
      } else { // delete file
        fs.unlinkSync(curPath);
      }
    });
    fs.rmdirSync(path);
  }
};

var runSvg2PdfCombiner = function(tempdir, data) {
  return new Promise(function(resolve, reject) {
    var promises = [];
    var svg_cache = {};
    for (var i = 0; i < data.svg.length; i++) {
      var svg = data.svg[i];
      if (svg_cache.hasOwnProperty(svg)) {
        promises.push(svg_cache[svg]);
        continue;
      }

      var svg_filename = tempdir + "/page-" + i + ".svg";
      fs.writeFileSync(svg_filename, svg);
      var promise = svg2pdf(svg_filename);
      svg_cache[svg] = promise;
      promises.push(promise);
    }

    Promise.all(promises)
    .then(function(pdfs) {
      var combined_filename = tempdir + "/combined.pdf";
      combine_pdfs(pdfs, combined_filename)
      .then((status) => {
        if (!status) {
          reject();
          return;
        }
        resolve(combined_filename);
      });
    })
    .catch(function(error) {
      reject(error);
    });
  });
};

function pad(n) {
  return n < 10 ? '0' + n : n;
}

function formatTimestamp(d) {
  return '' +
      d.getFullYear() +
      pad(d.getMonth() + 1) +
      pad(d.getDate()) + '-' +
      pad(d.getHours()) +
      pad(d.getMinutes()) +
      pad(d.getSeconds());
}

function getDownloadFilename(filename, now) {
  var ext = path.extname(filename);
  filename = path.basename(filename, ext);
  filename = filename.replace('"', '');
  filename += '-Annotated-';
  filename += formatTimestamp(now);
  filename += ext || '.pdf';
  return filename;
}

var server = http.createServer(function(request, response) {
  if (request.method === "OPTIONS") {
    // Pre-flight request
    response.writeHead(200, {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "POST",
      "Access-Control-Allow-Headers": "Content-Type",
      "Access-Control-Expose-Headers": "Content-Disposition"
    });
    response.end();
    return;
  }
  if (request.method !== "POST") {
    response.writeHead(400, {
      "Content-Type": "text/plain"
    });
    response.end('Bad Request');
    return;
  }

  var u = url.parse(request.url);
  if (u.pathname.indexOf("/download/") !== 0) {
    response.writeHead(404, {
      "Content-Type": "text/plain"
    });
    response.end('Not Found');
    return;
  }

  var room_id = u.pathname.substr(10);
  if (!rooms.hasOwnProperty(room_id)) {
    console.log("Unknown room", room_id);
    response.writeHead(404, {
      "Content-Type": "text/plain"
    });
    response.end('Not Found');
    return;
  }

  var room = rooms[room_id];

  var body = null;
  request.on("data", function(chunk) {
    if (body === null) {
      body = chunk;
    } else {
      body += chunk;
    }
  });

  request.on('end', () => {
    if (!body || !body.length) {
      console.log("Client sent an empty request");
      response.writeHead(400, {
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Methods": "POST",
        "Access-Control-Allow-Headers": "Content-Type, Content-Disposition",
        "Access-Control-Expose-Headers": "Content-Disposition",
        "Content-Type": "text/plain"
      });
      response.end('Bad Request');
      return;
    }

    var data = JSON.parse(body.toString("utf-8"));
    var token = data.token;
    var decoded;
    try {
      decoded = jwt.verify(token, secret, {"algorithms": ['HS256']});
    } catch (err) {
      console.log("Client sent an invalid token", token);
      response.writeHead(401, {
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Methods": "POST",
        "Access-Control-Allow-Headers": "Content-Type, Content-Disposition",
        "Access-Control-Expose-Headers": "Content-Disposition",
        "Content-Type": "text/plain"
      });
      response.end('Unauthorized');
      return;
    }

    if (room_id !== decoded.file) {
      console.log("Client sent a token for a different file", decoded);
      response.writeHead(401, {
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Methods": "POST",
        "Access-Control-Allow-Headers": "Content-Type, Content-Disposition",
        "Access-Control-Expose-Headers": "Content-Disposition",
        "Content-Type": "text/plain"
      });
      response.end('Unauthorized');
      return;
    }

    var downloader = room.downloadFile(token);

    var tempdir = createDirSync(os.tmpdir() + "/svg2pdf-XXXXXX");
    var combiner = runSvg2PdfCombiner(tempdir, data);

    Promise.all([downloader, combiner]).then(function(results) {
      var source_pdf = results[0];
      var combined_filename = results[1];
      if (!source_pdf.length) {
        deleteFolderRecursive(tempdir);
        console.log("Empty file received", room.id, token);
        response.writeHead(500, {
          "Access-Control-Allow-Origin": "*",
          "Access-Control-Allow-Methods": "POST",
          "Access-Control-Allow-Headers": "Content-Type, Content-Disposition",
          "Access-Control-Expose-Headers": "Content-Disposition",
          "Content-Type": "text/plain"
        });
        response.end('Internal Server Error');
        return;
      }

      overlay_pdf(source_pdf, combined_filename)
      .then((merged) => {
        add_text_annotations(merged, data.text, tempdir)
        .then((merged) => {
          deleteFolderRecursive(tempdir);
          if (!merged) {
            response.writeHead(500, {
              "Access-Control-Allow-Origin": "*",
              "Access-Control-Allow-Methods": "POST",
              "Access-Control-Allow-Headers": "Content-Type, Content-Disposition",
              "Access-Control-Expose-Headers": "Content-Disposition",
              "Content-Type": "text/plain"
            });
            response.end('Internal Server Error');
            return;
          }

          var now = new Date();
          var filename = getDownloadFilename(decoded.filename || room_id, now);
          response.writeHead(200, {
            "Access-Control-Allow-Origin": "*",
            "Access-Control-Allow-Methods": "POST",
            "Access-Control-Allow-Headers": "Content-Type, Content-Disposition",
            "Access-Control-Expose-Headers": "Content-Disposition",
            "Content-Type": "application/pdf",
            "Content-Disposition": "attachment; filename=\"" + filename + "\"",
            "Content-Length": merged.length
          });
          response.end(merged);
        });
      });
    })
    .catch(function(error) {
      deleteFolderRecursive(tempdir);
      if (error) {
        console.log("Error", error);
      }
      response.writeHead(500, {
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Methods": "POST",
        "Access-Control-Allow-Headers": "Content-Type, Content-Disposition",
        "Access-Control-Expose-Headers": "Content-Disposition",
        "Content-Type": "text/plain"
      });
      response.end('Internal Server Error');
    });
  });
});

var io = socketio(server, {
  'cors': {
    'origin': '*:*',
  }
});

io.on('connection', function(socket) {
  var query = socket.handshake.query;
  console.log('a user connected', query);

  var token = query.token;
  var decoded;
  try {
    decoded = jwt.verify(token, secret, {"algorithms": ['HS256']});
  } catch(err) {
    console.log("Invalid token received", err);
    socket.disconnect(true);
    return;
  }

  var baseurl = decoded.iss;
  if (!baseurl) {
    console.log('token did not contain a issuer', decoded);
    socket.disconnect(true);
    return;
  }

  var room_id = decoded.file;
  if (!room_id) {
    console.log("token did not contain a file id", decoded);
    socket.disconnect(true);
    return;
  }

  console.log("Token", decoded);

  var room;

  socket.on('disconnecting', function(reason) {
    if (!room) {
      return;
    }
    room.removeUser(socket);
    if (room.isEmpty()) {
      console.log("deleting empty room", room.id);
      delete rooms[room.id];
    }
  });

  socket.on('disconnect', function(reason) {
    console.log('a user disconnected');
  });

  if (!rooms.hasOwnProperty(room_id)) {
    room = rooms[room_id] = new Room(io, room_id, baseurl);
    console.log("created room", room_id);
  } else {
    room = rooms[room_id];
    console.log('joined room', room_id);
  }

  socket.on('message', function(message) {
    message.userid = socket.id;
    var page, name;
    if (message.type === "item") {
      page = message.item.page;
      name = message.item.name;
      var data = message.item.data;
      if (!page || !name || !data) {
        // Ignore invalid entries.
        return;
      }
      try {
        JSON.parse(data);
      } catch (e) {
        // Ignore items with invalid data.
        return;
      }
      if (!room.addItem(socket, name, page, data)) {
        return;
      }
    } else if (message.type === "delete") {
      page = message.delete.page;
      name = message.delete.name;
      if (!page || !name) {
        // Ignore invalid entries.
        return;
      }
      if (!room.removeItem(socket, name, page)) {
        return;
      }
    } else if (message.type === "control") {
      if (!room.handleControl(socket, message)) {
        return;
      }
    }
    room.sendMessage(socket, message);
  });

  socket.join(room_id);

  var displayname = decoded.displayname || null;
  var permissions = decoded.permissions || null;
  room.addUser(socket, {
    'displayname': displayname,
    'permissions': permissions
  });
});

server.listen(port, function() {
  console.log('listening on *:' + port);
});
