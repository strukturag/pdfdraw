/* eslint indent: ["error", 2, { "outerIIFEBody": 0, "SwitchCase": 1 }] */
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

import $ from 'jquery';
import io from 'socket.io-client';
import iro from '@jaames/iro';
import paper from 'paper';
import { pdfjsLib } from 'pdfjs-dist';
import { PDFViewerApplication, PDFViewerApplicationOptions } from 'pdfjs-dist-viewer-min';

(function() {
"use strict";

// TODO(jojo): Should get this from a viewer.js property.
var CSS_UNITS = 96.0 / 72.0;
var INITAL_COLORS  = [
  "#ff0000",
  "#008080",
  "#00ffff",
  "#00ff00",
  "#008000",
  "#c0c0c0",
  "#f7347a",
  "#990000",
  "#ccff00",
  "#3399ff",
  "#f6546a",
  "#ffff00",
  "#ffa500",
  "#0000ff",
  "#800080",
];

var PERMISSION_CREATE = 4;
var PERMISSION_READ = 1;
var PERMISSION_UPDATE = 2;
var PERMISSION_DELETE = 8;
var PERMISSION_SHARE = 16;
var PERMISSION_ALL = 31;

// Taken from https://gist.github.com/jed/982883
function uuidv4() {
  return ([1e7]+-1e3+-4e3+-8e3+-1e11).replace(/[018]/g, c =>
    (c ^ crypto.getRandomValues(new Uint8Array(1))[0] & 15 >> c / 4).toString(16)
  );
}

function getRandomColor() {
  return INITAL_COLORS[Math.floor(Math.random() * INITAL_COLORS.length)];
}

// Required for running in older versions of Qt (see #31).
// https://github.com/uxitten/polyfill/blob/master/string.polyfill.js
// https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/String/padStart
if (!String.prototype.padStart) {
  String.prototype.padStart = function padStart(targetLength, padString) {
    targetLength = targetLength >> 0; //truncate if number, or convert non-number to 0;
    padString = String(padString !== undefined ? padString : ' ');
    if (this.length >= targetLength) {
      return String(this);
    } else {
      targetLength = targetLength - this.length;
      if (targetLength > padString.length) {
        padString += padString.repeat(targetLength / padString.length); //append to original to ensure we are longer than needed
      }
      return padString.slice(0, targetLength) + String(this);
    }
  };
}

var uid = uuidv4();
var object_count = 0;

function getObjectId() {
  return uid + ":" + (++object_count);
}

var Storage = function(prefix) {
  this.prefix = prefix;
  this.storage = window.localStorage;
  if (!this.storage) {
    console.warn('LocalStorage not available, saving of settings will be disabled.');
  }
};

Storage.prototype._getKey = function(key) {
  if (!this.prefix) {
    return key;
  }

  return this.prefix + '.' + key;
};

Storage.prototype.get = function(key) {
  if (!this.storage) {
    return null;
  }

  return this.storage.getItem(this._getKey(key));
};

Storage.prototype.set = function(key, value) {
  if (!this.storage) {
    return;
  } else if (!value) {
    this.storage.removeItem(this._getKey(key));
    return;
  }

  this.storage.setItem(this._getKey(key), value);
};

var BaseDrawer = function(annotator, previous_mode) {
  this.annotator = annotator;
  this.previous_mode = previous_mode;
};

BaseDrawer.prototype.destroy = function() {};
BaseDrawer.prototype.activate = function(page_annotator) {};
BaseDrawer.prototype.onMouseDown = function(page_annotator, event) {};
BaseDrawer.prototype.onMouseUp = function(page_annotator, event) {};
BaseDrawer.prototype.onMouseDrag = function(page_annotator, event) {};
BaseDrawer.prototype.onMouseEnter = function(page_annotator, event) {};
BaseDrawer.prototype.onMouseLeave = function(page_annotator, event) {};
BaseDrawer.prototype.onMouseMove = function(page_annotator, event) {};
BaseDrawer.prototype.onClick = function(page_annotator, event) {};
BaseDrawer.prototype.onKeyUp = function(page_annotator, event) {};
BaseDrawer.prototype.onItemMoved = function(page_annotator, name, item, event) {};

var NullDrawer = function() {
  BaseDrawer.apply(this, arguments);
};
NullDrawer.prototype = Object.create(BaseDrawer.prototype);

var FreehandDrawer = function(annotator) {
  BaseDrawer.apply(this, arguments);
  this.path = null;
  this.intervalId = null;
};
FreehandDrawer.prototype = Object.create(BaseDrawer.prototype);

FreehandDrawer.prototype.sendPath = function() {
  if (this.path && this.path.segments.length) {
    this.annotator.sendItem(this.page_annotator, this.path);
  }
};

FreehandDrawer.prototype.onMouseDown = function(page_annotator, event) {
  page_annotator.activate();
  this.page_annotator = page_annotator;
  this.intervalId = setInterval(this.sendPath.bind(this), 250);
  this.path = page_annotator.createPath({
    name: getObjectId(),
    strokeColor: this.annotator.color,
    strokeWidth: 5
  });
};

FreehandDrawer.prototype.onMouseUp = function(page_annotator, event) {
  if (!this.path) {
    return;
  }
  if (this.path.segments.length) {
    this.path.smooth();
    this.annotator.sendItem(page_annotator, this.path);
  }
  this.path = null;
  clearInterval(this.intervalId);
};

FreehandDrawer.prototype.onMouseDrag = function(page_annotator, event) {
  if (!this.path) {
    return;
  }
  this.path.add(event.point);
};

var LineDrawer = function(annotator) {
  FreehandDrawer.apply(this, arguments);
};

LineDrawer.prototype = Object.create(FreehandDrawer.prototype);

LineDrawer.prototype.onMouseDrag = function(page_annotator, event) {
  if (!this.path) {
    return;
  }
  this.path.removeSegment(1);
  this.path.add(event.point);
};

var RectangleDrawer = function(annotator) {
  BaseDrawer.apply(this, arguments);
  this.options = {};
  this.rect = null;
};

RectangleDrawer.prototype = Object.create(BaseDrawer.prototype);

RectangleDrawer.prototype.onMouseDown = function(page_annotator, event) {
  page_annotator.activate();
  this.options = {
    name: getObjectId(),
    strokeColor: this.annotator.color,
    strokeWidth: 5,
    from: [event.point.x, event.point.y],
    to: [event.point.x, event.point.y],
  };
  this.update(page_annotator);
};

RectangleDrawer.prototype.update = function(page_annotator) {
  var create = page_annotator.createRectangle.bind(page_annotator);
  if (!this.rect) {
    this.rect = create(this.options);
  } else {
    this.rect = this.rect.replaceWith(create(this.options));
  }
};

RectangleDrawer.prototype.onMouseUp = function(page_annotator, event) {
  if (!this.rect) {
    return;
  }
  this.options.to = [event.point.x, event.point.y];
  this.update(page_annotator);
  this.rect.ready = true;
  this.annotator.sendItem(page_annotator, this.rect);
  this.options = {};
  this.rect = null;
};

RectangleDrawer.prototype.onMouseDrag = function(page_annotator, event) {
  if (!this.rect) {
    return;
  }
  this.options.to = [event.point.x, event.point.y];
  this.update(page_annotator);
};

var EllipseDrawer = function(annotator) {
  BaseDrawer.apply(this, arguments);
  this.options = {};
  this.ellipse = null;
};

EllipseDrawer.prototype = Object.create(BaseDrawer.prototype);

EllipseDrawer.prototype.onMouseDown = function(page_annotator, event) {
  page_annotator.activate();
  this.options = {
    name: getObjectId(),
    strokeColor: this.annotator.color,
    strokeWidth: 5,
    from: [event.point.x, event.point.y],
    to: [event.point.x, event.point.y],
  };
  this.update(page_annotator);
};

EllipseDrawer.prototype.update = function(page_annotator) {
  var create = page_annotator.createEllipse.bind(page_annotator);
  if (!this.ellipse) {
    this.ellipse = create(this.options);
  } else {
    var temp_ellipse = create(this.options);
    this.ellipse = this.ellipse.replaceWith(temp_ellipse);
  }
};

EllipseDrawer.prototype.onMouseUp = function(page_annotator, event) {
  if (!this.ellipse) {
    return;
  }
  this.options.to = [event.point.x, event.point.y];
  this.update(page_annotator);
  this.ellipse.ready = true;
  this.annotator.sendItem(page_annotator, this.ellipse);
  this.options = {};
  this.ellipse = null;
};

EllipseDrawer.prototype.onMouseDrag = function(page_annotator, event) {
  if (!this.ellipse) {
    return;
  }
  this.options.to = [event.point.x, event.point.y];
  this.update(page_annotator);
};

var PointerDrawer = function(annotator) {
  BaseDrawer.apply(this, arguments);
};
PointerDrawer.prototype = Object.create(BaseDrawer.prototype);

PointerDrawer.prototype.destroy = function() {
  this.annotator.destroyCursors();
};

PointerDrawer.prototype.onMouseMove = function(page_annotator, event) {
  this.annotator.renderCursor(page_annotator, event.point.x, event.point.y);
};

PointerDrawer.prototype.onMouseLeave = function(page_annotator, event) {
  this.annotator.hideCursor();
};

var SelectDrawer = function(annotator) {
  BaseDrawer.apply(this, arguments);
  this.selected_item = null;
  this.pending_items = {};
  this.send_interval = setInterval(this._sendPending.bind(this), 100);
};
SelectDrawer.prototype = Object.create(BaseDrawer.prototype);

SelectDrawer.prototype._select = function(item) {
  if (this.selected_item === item) {
    return;
  }

  this._unselect();
  this.selected_item = item;
  this.selected_item.shadowColor = "black";
  this.selected_item.shadowBlur = 10;
};

SelectDrawer.prototype._unselect = function() {
  if (!this.selected_item) {
    return;
  }

  this.selected_item.shadowColor = null;
  this.selected_item.shadowBlur = 0;
  this.selected_item = null;
};

SelectDrawer.prototype._sendItem = function(page_annotator, item) {
  // Need to remove "selected" layout while generating item JSON.
  var is_selected = (item === this.selected_item);
  if (is_selected) {
    this._unselect();
  }
  this.annotator.sendItem(page_annotator, item);
  if (is_selected) {
    this._select(item);
  }
};

SelectDrawer.prototype._sendPending = function() {
  var now = Date.now();
  for (var name in this.pending_items) {
    if (!this.pending_items.hasOwnProperty(name)) {
      continue;
    }

    var info = this.pending_items[name];
    var page_annotator = info[0];
    var item = info[1];
    var last_change = info[2];
    if (now - last_change < 250) {
      continue;
    }

    this._sendItem(page_annotator, item);
    delete this.pending_items[name];
  }
};

SelectDrawer.prototype.destroy = function() {
  clearInterval(this.send_interval);
  this._sendPending();
  this._unselect();
};

SelectDrawer.prototype.onMouseDown = function(page_annotator, event) {
  var hit = page_annotator.scope.project.hitTest(event.point);
  if (!hit) {
    this._unselect();
    return;
  }

  this._select(hit.item);
};

SelectDrawer.prototype.onClick = function(page_annotator, event) {
  var hit = page_annotator.scope.project.hitTest(event.point);
  if (!hit) {
    this._unselect();
    return;
  }

  this._select(hit.item);
};

SelectDrawer.prototype.onKeyUp = function(page_annotator, event) {
  if (!this.selected_item) {
    return;
  }

  switch (event.keyCode) {
    case 8: // Backspace
      // Fallthrough
    case 46: // Delete key
      this.annotator.deleteItem(page_annotator, this.selected_item);
      this.selected_item.remove();
      this._unselect();
      break;
  }
};

SelectDrawer.prototype.onItemMoved = function(page_annotator, name, item, event) {
  event.stopPropagation();
  item.position.x += event.delta.x;
  item.position.y += event.delta.y;
  if (this.pending_items.hasOwnProperty(name)) {
    this.pending_items[name][0] = page_annotator;
    this.pending_items[name][1] = item;
  } else {
    this.pending_items[name] = [page_annotator, item, Date.now()];
  }
};

var ColorPickerDrawer = function(annotator, previous_mode) {
  BaseDrawer.apply(this, arguments);
  this.annotator.showColorPicker();
};
ColorPickerDrawer.prototype = Object.create(BaseDrawer.prototype);

ColorPickerDrawer.prototype.destroy = function() {
  this.annotator.hideColorPicker();
};

ColorPickerDrawer.prototype.onClick = function(page_annotator, event) {
  this.annotator.setDrawMode(this.previous_mode);
};

var Cursor = function(annotator, userid, radius) {
  this.annotator = annotator;
  this.page_annotator = null;
  this.name = getObjectId();
  this.userid = userid;
  this.radius = radius;
  this.circle = null;
  this.label = $("<div class='cursor'></div>");
  this.label.css('position', 'absolute');
};

Cursor.prototype.destroy = function() {
  if (this.page_annotator) {
    this.page_annotator.unregisterPendingActivate(this);
  }
  if (this.circle) {
    this.circle.remove();
    this.circle = null;
  }
  this.label.remove();
};

Cursor.prototype.draw = function(page_annotator, x, y, color, text) {
  this.x = x;
  this.y = y;
  var center = new paper.Point(x, y);
  if (this.page_annotator && page_annotator !== this.page_annotator) {
    this.page_annotator.unregisterPendingActivate(this);
    if (this.page_annotator.container) {
      this.page_annotator.container.remove(this.label);
    }
    this.page_annotator = null;
    this.destroy();
  }
  if (!this.circle) {
    page_annotator.activate();
    this.circle = new paper.Path.Circle(center, this.radius);
  }
  if (!this.page_annotator) {
    this.page_annotator = page_annotator;
    if (this.page_annotator.container) {
      this.page_annotator.container.append(this.label);
    } else {
      this.page_annotator.registerPendingActivate(this);
    }
  }
  this.circle.set({
    fillColor: color,
    shadowColor: color,
    shadowBlur: 10,
    position: center
  });
  this.label.html(text);
  this.update();
};

Cursor.prototype.activate = function(page_annotator) {
  if (page_annotator !== this.page_annotator) {
    return;
  }

  this.label.remove();
  if (page_annotator.container) {
    page_annotator.container.append(this.label);
  }
};

Cursor.prototype.update = function() {
  var radius = this.circle.bounds.width / 2;
  var newRadius = this.radius / this.page_annotator.scale;
  if (radius !== newRadius) {
    this.circle.scale(newRadius / radius);
  }
  var x = this.x * this.page_annotator.scale;
  var y = this.y * this.page_annotator.scale;
  this.label.css('left', x + (this.radius * 2));
  this.label.css('top', y - (this.radius));
};

var PageAnnotator = function(annotator, pagenum, container, page) {
  this.annotator = annotator;
  this.pagenum = pagenum;
  this.container = container;
  this.page = page;
  this.pending_activation = {};
  this.canvas = document.createElement("canvas");
  this.canvas.style.position = "absolute";
  this.canvas.style.left = 0;
  this.canvas.style.top = 0;
  this.canvas.style.right = 0;
  this.canvas.style.bottom = 0;
  this.scope = new paper.PaperScope();
  this.scope.setup(this.canvas);
  if (page) {
    this.setPage(page, container);
  }
  this.view = this.scope.getView();
  this.view.on('mousedown', function() {
    var args = Array.prototype.slice.call(arguments);
    args.unshift(this);
    this.activate();
    this.annotator.drawer.onMouseDown.apply(this.annotator.drawer, args);
  }.bind(this));
  this.view.on('mouseup', function() {
    var args = Array.prototype.slice.call(arguments);
    args.unshift(this);
    this.activate();
    this.annotator.drawer.onMouseUp.apply(this.annotator.drawer, args);
  }.bind(this));
  this.view.on('mousedrag', function() {
    var args = Array.prototype.slice.call(arguments);
    args.unshift(this);
    this.activate();
    this.annotator.drawer.onMouseDrag.apply(this.annotator.drawer, args);
  }.bind(this));
  this.view.on('mouseenter', function() {
    var args = Array.prototype.slice.call(arguments);
    args.unshift(this);
    this.activate();
    this.annotator.drawer.onMouseEnter.apply(this.annotator.drawer, args);
  }.bind(this));
  this.view.on('mouseleave', function() {
    var args = Array.prototype.slice.call(arguments);
    args.unshift(this);
    this.activate();
    this.annotator.drawer.onMouseLeave.apply(this.annotator.drawer, args);
  }.bind(this));
  // Sometimes the "mouseleave" event of paper.js doesn't fire when
  // switching views, also handle "mouseleave" on the canvas itself
  // as a workaround.
  $(this.canvas).on('mouseleave', function() {
    var args = Array.prototype.slice.call(arguments);
    args.unshift(this);
    this.activate();
    this.annotator.drawer.onMouseLeave.apply(this.annotator.drawer, args);
  }.bind(this));
  this.view.on('mousemove', function() {
    var args = Array.prototype.slice.call(arguments);
    args.unshift(this);
    this.activate();
    this.annotator.drawer.onMouseMove.apply(this.annotator.drawer, args);
  }.bind(this));
  this.view.on('click', function() {
    var args = Array.prototype.slice.call(arguments);
    args.unshift(this);
    this.activate();
    this.annotator.drawer.onClick.apply(this.annotator.drawer, args);
  }.bind(this));
  $(window).keyup(function(event) {
    if (PageAnnotator.prototype.__active !== this) {
      return;
    }

    var args = Array.prototype.slice.call(arguments);
    args.unshift(this);
    this.activate();
    this.annotator.drawer.onKeyUp.apply(this.annotator.drawer, args);
  }.bind(this));
};

PageAnnotator.prototype.activate = function() {
  PageAnnotator.prototype.__active = this;
  for (var drawerName in this.pending_activation) {
    if (!this.pending_activation.hasOwnProperty(drawerName)) {
      continue;
    }

    this.pending_activation[drawerName].activate(this);
  }
  this.pending_activation = {};
  this.scope.activate();
};

PageAnnotator.prototype.registerPendingActivate = function(drawer) {
  this.pending_activation[drawer.name] = drawer;
};

PageAnnotator.prototype.unregisterPendingActivate = function(drawer) {
  delete this.pending_activation[drawer.name];
};

PageAnnotator.prototype.setPage = function(page, container) {
  this.container = container;
  this.page = page;
  var pagesize = page.view;
  this.pagewidth = (pagesize[2] - pagesize[0]) * CSS_UNITS;
  this.pageheight = (pagesize[3] - pagesize[1]) * CSS_UNITS;
  if (this.container) {
    this.container.append(this.canvas);
  }
};

PageAnnotator.prototype.update = function(scale) {
  if (this.container && !this.container.has(this.canvas).length) {
    this.container.append(this.canvas);
  }
  this.scale = scale;
  var width = this.pagewidth * scale;
  var height = this.pageheight * scale;
  this.view.viewSize = new paper.Size(width, height);
  this.view.center = new paper.Point(
    (width + (this.pagewidth * (1 - scale))) / 2,
    (height + (this.pageheight * (1 - scale))) / 2);
  this.view.zoom = scale;
  this.view._needsUpdate = true;
  this.view.requestUpdate();
};

PageAnnotator.prototype.createPath = function(options) {
  var path = new paper.Path(options || {});
  path.onMouseDrag = function(event) {
    this.annotator.drawer.onItemMoved(this, path.name, path, event);
  }.bind(this);
  return path;
};

PageAnnotator.prototype.createRectangle = function(options) {
  var rect = new paper.Path.Rectangle(options || {});
  rect.onMouseDrag = function(event) {
    if (rect.ready) {
      this.annotator.drawer.onItemMoved(this, rect.name, rect, event);
    }
  }.bind(this);
  return rect;
};

PageAnnotator.prototype.createEllipse = function(options) {
  var from = new paper.Point(options.from);
  var to = new paper.Point(options.to);
  var rectangle = new paper.Rectangle(
    from, to
  );
  var ellipse = new paper.Path.Ellipse(rectangle);
  ellipse.strokeColor = options.strokeColor;
  ellipse.strokeWidth = options.strokeWidth;
  ellipse.name = options.name;
  ellipse.onMouseDrag = function(event) {
    if (ellipse.ready) {
      this.annotator.drawer.onItemMoved(this, ellipse.name, ellipse, event);
    }
  }.bind(this);
  return ellipse;
};

PageAnnotator.prototype.drawItem = function(name, data) {
  this.activate();
  var path = this.scope.project.getItem({"name": name});
  if (!path) {
    path = this.createPath();
  }
  try {
    path.importJSON(data);
  } catch (e) {
    path.remove();
    path.name = name;
    this.annotator.deleteItem(this, path);
    console.log("Could not import item", data, e);
    return;
  }
  path.name = name;
};

PageAnnotator.prototype.deleteItem = function(name) {
  this.activate();
  var path = this.scope.project.getItem({"name": name});
  if (!path) {
    return;
  }

  path.remove();
};

function Annotator(socketurl, id, userid, displayname, token) {
  this.annotators = {};
  this.cursors = {};
  this.draw_mode = null;
  this.drawer = this.nulldrawer = new NullDrawer();
  this.id = id;
  this.userid = userid;
  this.displayname = displayname;
  this.token = token;
  this.storage = new Storage('pdfdraw');
  var color = this.storage.get('color');
  if (!color) {
    color = getRandomColor();
    this.storage.set('color', color);
  }
  this.color = color;
  this.pageCount = -1;
  this.currentPage = null;
  this.users = {};
  this.has_document = false;
  this.setDrawMode('pointer');
  this.pending_messages = [];
  this.socketurl = socketurl;
  this.socket = io(socketurl, {
    'transports': ['websocket'],
    'query': {
      'token': token
    }
  });
  // Also allow polling connections when the connection was interrupted once
  // (could be caused by proxy / firewall).
  this.socket.io.on('reconnect_attempt', function() {
    this.socket.io.opts.transports = ['polling', 'websocket'];
  }.bind(this));
  this.socket.io.on('reconnect', this.onReconnected.bind(this));
  this.socket.on('message', this.onMessage.bind(this));
  this.socket.on('user.joined', this.onUserJoined.bind(this));
  this.socket.on('user.left', this.onUserLeft.bind(this));
  this.socket.on('connect', this.onConnected.bind(this));
  this.socket.on('disconnect', this.onDisconnect.bind(this));

  this.colorPicker = new iro.ColorPicker("#colorPicker", {
    width: 320,
    height: 320,
    color: this.color,
    transparency: true,
  });
  var setColor = function(color) {
    this.color = color.hex8String;
    this.storage.set('color', this.color);
    $(".modeButton.colorMode, .modeButton.colorMode:focus")
      .css("background-color", this.color);
  }.bind(this);
  this.colorPicker.on("color:init", setColor);
  this.colorPicker.on("color:change", setColor);

  this.userlist = $("<div class='userlist'></div>");
  $("#mainContainer").append(this.userlist);
  this.connectionError = $("#connectionError");
  this.connectingMessage = $("#connectingMessage");
}

Annotator.prototype.showColorPicker = function() {
  $("#colorPicker").show();
};

Annotator.prototype.hideColorPicker = function() {
  $("#colorPicker").hide();
};

Annotator.prototype.onDisconnect = function() {
  this.users = {};
  this.updateUsersList();
  this.connectionError.show();
};

Annotator.prototype.onConnected = function() {
  if (!this.connectingMessage) {
    return;
  }

  this.connectingMessage.hide();
  this.connectingMessage = null;
};

Annotator.prototype.onReconnected = function() {
  this.connectionError.hide();
};

function compareEntries(a, b) {
  // Compare by display name.
  a = a[1].toLocaleLowerCase();
  b = b[1].toLocaleLowerCase();
  return a.localeCompare(b);
}

Annotator.prototype.updateUsersList = function() {
  var entries = [];
  for (var userid in this.users) {
    if (!this.users.hasOwnProperty(userid)) {
      continue;
    }

    entries.push([userid, this.users[userid].displayname || "Anonymous"]);
  }
  this.userlist.empty();
  if (!entries.length) {
    this.userlist.hide();
    return;
  }

  entries.sort(compareEntries);
  for (var i = 0; i < entries.length; ++i) {
    userid = entries[i][0];
    var displayname = entries[i][1];
    var elem = $("<div></div>").text(displayname);
    if (userid === this.socket.id) {
      elem.addClass("own");
    }
    this.userlist.append(elem);
  }
  this.userlist.show();
};

Annotator.prototype.onUserJoined = function(message) {
  for (var i = 0; i < message.length; ++i) {
    var userid = message[i].userid;
    if (!userid) {
      continue;
    }

    this.users[userid] = message[i];
  }
  this.updateUsersList();
};

Annotator.prototype.onUserLeft = function(message) {
  var userid = message.userid;
  if (!userid || !this.users.hasOwnProperty(userid)) {
    return;
  }

  delete this.users[userid];
  this.updateUsersList();
};

Annotator.prototype.documentLoaded = function(pdfDocument) {
  this.pageCount = pdfDocument.numPages;

  this.has_document= true;
  while (this.pending_messages.length) {
    var message = this.pending_messages.shift();
    this.onMessage(message);
  }

  if (this.connectingMessage) {
    this.connectingMessage.show();
  }
};

Annotator.prototype.sendMessage = function(message) {
  // console.log("Send", message);
  this.socket.emit('message', message);
};

Annotator.prototype.sendItem = function(page_annotator, item) {
  var data = item.exportJSON();
  if (!data) {
    console.log("Can't export to JSON", item);
    return;
  }

  this.sendMessage({
    'type': 'item',
    'item': {
      'page': page_annotator.pagenum,
      'name': item.name,
      'data': data
    }
  });
};

Annotator.prototype.deleteItem = function(page_annotator, item) {
  this.sendMessage({
    'type': 'delete',
    'delete': {
      'page': page_annotator.pagenum,
      'name': item.name
    }
  });
};

Annotator.prototype.onMessage = function(message) {
  // console.log("Received", message);
  if (!this.has_document) {
    this.pending_messages.push(message);
    return;
  }

  this.processMessage(message);
};

Annotator.prototype.renderCursor = function(page_annotator, x, y) {
  var cursor = this.getCursor(this.userid, 5);
  cursor.draw(page_annotator, x, y, this.color, this.displayname);
  var data = {
    'type': 'cursor',
    'cursor': {
      'action': 'show',
      'page': page_annotator.pagenum,
      'x': x,
      'y': y,
      'color': this.color
    }
  };
  this.sendMessage(data);
};

Annotator.prototype.getCursor = function(userid, size) {
  var cursor;
  if (!this.cursors.hasOwnProperty(userid)) {
    cursor = this.cursors[userid] = new Cursor(this, userid, size);
  } else {
    cursor = this.cursors[userid];
  }
  return cursor;
};

Annotator.prototype.showCursor = function(userid, data) {
  if (!this.users.hasOwnProperty(userid)) {
    return;
  }

  var displayname = this.users[userid].displayname || "Anonymous";
  var cursor = this.getCursor(userid, 5);
  this.getPage(data.page).then(function(page_annotator) {
    cursor.draw(page_annotator, data.x, data.y, data.color, displayname);
  });
};

Annotator.prototype.hideCursor = function(userid) {
  if (!userid) {
    var data = {
      'type': 'cursor',
      'cursor': {
        'action': 'hide'
      }
    };
    this.sendMessage(data);
    userid = this.userid;
  }
  if (!this.cursors.hasOwnProperty(userid)) {
    return;
  }

  var cursor = this.cursors[userid];
  delete this.cursors[userid];
  cursor.destroy();
};

Annotator.prototype.destroyCursors = function() {
  for (var i in this.cursors) {
    if (!this.cursors.hasOwnProperty(i)) {
      continue;
    }

    this.cursors[i].destroy();
  }
  this.cursors = {};
};

Annotator.prototype.getExistingPage = function(pagenum) {
  if (typeof(pagenum) === "string") {
    pagenum = parseInt(pagenum, 10);
  }
  if (!this.annotators.hasOwnProperty(pagenum)) {
    return null;
  }

  return this.annotators[pagenum];
};

Annotator.prototype.getPage = function(pagenum, page, container) {
  if (typeof(pagenum) === "string") {
    pagenum = parseInt(pagenum, 10);
  }
  return new Promise(function(resolve, reject) {
    var page_annotator;
    if (!this.annotators.hasOwnProperty(pagenum)) {
      page_annotator = this.annotators[pagenum] = new PageAnnotator(this, pagenum, container, page);
    } else {
      page_annotator = this.annotators[pagenum];
    }

    if (page_annotator.page && page_annotator.container) {
      return resolve(page_annotator);
    } else if (page && container) {
      page_annotator.setPage(page, container);
      return resolve(page_annotator);
    }
    if (page_annotator.page || !PDFViewerApplication.pdfViewer.pdfDocument) {
      return resolve(page_annotator);
    }

    PDFViewerApplication.pdfViewer.pdfDocument.getPage(pagenum).then(function(page) {
      page_annotator.setPage(page, page_annotator.container);
      page_annotator.update(PDFViewerApplication.pdfViewer.currentScale);
      return resolve(page_annotator);
    }, function(error) {
      return reject(error);
    });
  }.bind(this));
};

Annotator.prototype.destroyDrawer = function() {
  if (this.drawer && this.drawer !== this.nulldrawer) {
    var drawer = this.drawer;
    this.drawer = this.nulldrawer;
    drawer.destroy();
  }
};

Annotator.prototype.updateDrawer = function(previous_mode) {
  this.destroyDrawer();
  switch (this.draw_mode) {
    case "freehand":
      this.drawer = new FreehandDrawer(this, previous_mode);
      break;
    case "rectangle":
      this.drawer = new RectangleDrawer(this, previous_mode);
      break;
    case "ellipse":
      this.drawer = new EllipseDrawer(this, previous_mode);
      break;
    case "pointer":
      this.drawer = new PointerDrawer(this, previous_mode);
      break;
    case "select":
      this.drawer = new SelectDrawer(this, previous_mode);
      break;
    case "color":
      this.drawer = new ColorPickerDrawer(this, previous_mode);
      break;
    case "line":
      this.drawer = new LineDrawer(this, previous_mode);
      break;
    case null:
      break;
    default:
      console.log("Unknown draw mode", this.draw_mode);
      return;
  }
};

Annotator.prototype.setDrawMode = function(mode) {
  if (this.draw_mode === mode) {
    if (mode === "color") {
      // Toggle back from color picker.
      this.setDrawMode(this.drawer.previous_mode);
    }
    return;
  }

  var previous_mode = this.draw_mode;
  $(".toolbarButton.selected").removeClass('selected');
  this.draw_mode = mode;
  $("#" + (mode || "none") + "Mode").addClass('selected');
  switch (mode) {
    case "select":
    case "color":
    case "pointer":
    case null:
      break;
    default:
      $("#drawModeToolbar").addClass('selected');
      break;
  }
  this.updateDrawer(previous_mode);
};

Annotator.prototype.switchPage = function(pagenum) {
  if (pagenum === this.currentPage) {
    return;
  }

  this.currentPage = pagenum;
  this.sendMessage({
    'type': 'control',
    'control': {
      'type': 'page',
      'page': pagenum
    }
  });
};

Annotator.prototype.processMessage = function(message) {
  switch (message.type) {
    case 'cursor':
      this.processCursorMessage(message.userid, message.cursor);
      break;
    case 'item':
      this.processItemMessage(message.userid, message.item);
      break;
    case 'delete':
      this.processDeleteMessage(message.userid, message.delete);
      break;
    case 'control':
      this.processControlMessage(message.userid, message.control);
      break;
    default:
      console.log('Unknown message', message);
      break;
  }
};

Annotator.prototype.processCursorMessage = function(userid, message) {
  switch (message.action) {
    case 'hide':
      this.hideCursor(userid);
      break;
    case 'show':
    default:
      this.showCursor(userid, message);
      break;
  }
};

Annotator.prototype.processItemMessage = function(userid, message) {
  this.getPage(message.page).then(function(page_annotator) {
    page_annotator.drawItem(message.name, message.data);
  });
};

Annotator.prototype.processDeleteMessage = function(userid, message) {
  this.getPage(message.page).then(function(page_annotator) {
    page_annotator.deleteItem(message.name);
  });
};

Annotator.prototype.processControlMessage = function(userid, message) {
  switch (message.type) {
    case 'page':
      var page = message.page;
      if (page >= 1 && page <= PDFViewerApplication.pagesCount && page !== PDFViewerApplication.page) {
        this.currentPage = page;
        PDFViewerApplication.page = page;
      }
      break;
    default:
      console.log('Unsupported control message', message);
      return;
  }
};

Annotator.prototype.exportSVG = function() {
  return new Promise(function(resolve, reject) {
    var result = [];
    var pages = [];

    var continueExport = function() {
      // Remove trailing empty pages.
      while (result.length && !result[result.length-1]) {
        result.pop();
      }

      // No annotations yet?
      if (!result.length) {
        return resolve(result);
      }

      // Need to keep a last empty page to avoid duplicating the last overlay.
      if (result.length < this.pageCount) {
        var page = pages[result.length + 1];
        if (page) {
          var svg = page.scope.project.exportSVG({
            asString: true
          });
          result.push(svg);
        }
      }
      return resolve(result);
    }.bind(this);

    var remaining = this.pageCount;
    for (var i = 1; i <= this.pageCount; i++) {
      this.getPage(i).then(function(pagenum, page_annotator) {
        pages[pagenum] = page_annotator;
        var svg = null;
        if (page_annotator) {
          svg = page_annotator.scope.project.exportSVG({
            asString: true
          });
        }
        result[pagenum - 1] = svg;
        remaining -= 1;
        if (remaining === 0) {
          continueExport();
        }
      }.bind(this, i));
    }
  }.bind(this));
};

Annotator.prototype.downloadPdf = function() {
  this.exportSVG().then(function(svg) {
    if (!svg.length) {
      // No items drawn yet, download source PDF.
      console.log("Download source PDF");
      return;
    }

    var data = {
      "svg": svg,
      "token": this.token,
    };

    // Download code from https://stackoverflow.com/a/23797348
    var xhr = new XMLHttpRequest();
    var base_url = this.socketurl;
    if (base_url[base_url.length-1] !== '/') {
      base_url += '/';
    }
    xhr.open('POST', base_url + "download/" + this.id, true);
    xhr.responseType = 'arraybuffer';
    xhr.onload = function() {
      $("#downloadInProgress").hide();
      if (this.status !== 200) {
        $("#downloadFailed").show();
        setTimeout(function() {
          $("#downloadFailed").hide();
        }, 4000);
        return;
      }

      var filename = "";
      var disposition = xhr.getResponseHeader('Content-Disposition');
      if (disposition && disposition.indexOf('attachment') !== -1) {
        var filenameRegex = /filename[^;=\n]*=((['"]).*?\2|[^;\n]*)/;
        var matches = filenameRegex.exec(disposition);
        if (matches != null && matches[1]) {
          filename = matches[1].replace(/['"]/g, '');
        }
      }
      var type = xhr.getResponseHeader('Content-Type');

      var blob = typeof File === 'function'
        ? new File([this.response], filename, { type: type })
        : new Blob([this.response], { type: type });
      if (typeof window.navigator.msSaveBlob !== 'undefined') {
        // IE workaround for "HTML7007: One or more blob URLs were revoked by
        // closing the blob for which they were created. These URLs will no
        // longer resolve as the data backing the URL has been freed."
        window.navigator.msSaveBlob(blob, filename);
      } else {
        var URL = window.URL || window.webkitURL;
        var downloadUrl = URL.createObjectURL(blob);

        if (filename) {
          // use HTML5 a[download] attribute to specify filename
          var a = document.createElement("a");
          // safari doesn't support this yet
          if (typeof a.download === 'undefined') {
            window.location = downloadUrl;
          } else {
            a.href = downloadUrl;
            a.download = filename;
            document.body.appendChild(a);
            a.click();
          }
        } else {
          window.location = downloadUrl;
        }

        setTimeout(function() {
          URL.revokeObjectURL(downloadUrl);
        }, 100); // cleanup
      }
    };
    xhr.setRequestHeader("Content-Type", "application/json");
    xhr.send(JSON.stringify(data));
    $("#downloadInProgress").show();
  }.bind(this));
};

$(document).ready(function() {
  var fileid = document.getElementsByTagName('head')[0].getAttribute('data-fileid');
  var userid = document.getElementsByTagName('head')[0].getAttribute('data-userid');
  var displayname = document.getElementsByTagName('head')[0].getAttribute('data-displayname');
  var socketurl = document.getElementsByTagName('head')[0].getAttribute('data-socketurl');
  var token = document.getElementsByTagName('head')[0].getAttribute('data-token');
  var permissions = parseInt(document.getElementsByTagName('head')[0].getAttribute('data-permissions'), 10);
  if (!fileid || !socketurl || !token) {
    window.location.href = '/';
    return;
  }

  var can_update = ((permissions & PERMISSION_UPDATE) === PERMISSION_UPDATE);

  var annotator = new Annotator(socketurl, fileid, userid, displayname, token);

  $(document).on('pagesloaded', function(event) {
    annotator.documentLoaded(PDFViewerApplication.pdfViewer.pdfDocument);
    if (!can_update) {
      $('#viewer .page[data-page-number!=1]').addClass('hiddenPage');
    }
  });

  $(document).on('pagerendered', function(event) {
    var pagenum = event.detail.pageNumber;
    if (!pagenum) {
      console.log("Rendered event without page number", event);
      return;
    }

    var container = $(event.target);
    PDFViewerApplication.pdfViewer.pdfDocument.getPage(pagenum).then(function(page) {
      annotator.getPage(pagenum, page, container).then(function(page_annotator) {
        page_annotator.update(PDFViewerApplication.pdfViewer.currentScale);
      });
    });
  });

  $(document).on('pagechange', function(event) {
    var originalEvent = event.originalEvent;
    if (!originalEvent || typeof(originalEvent.pageNumber) === 'undefined') {
      return;
    }

    var pagenum = originalEvent.pageNumber;
    if (can_update) {
      annotator.switchPage(pagenum);
    } else {
      $('#viewer .page').addClass('hiddenPage');
      var page = $('#viewer .page[data-page-number=' + pagenum +']');
      page.removeClass('hiddenPage');
      // Need to redraw currently visible page to fix any layout issues.
      setTimeout(function() {
        PDFViewerApplication.pdfViewer.update();
      }, 0);
    }
  });

  $(".modeButton").click(function(event) {
    var button = $(event.target);
    annotator.setDrawMode(button.data("mode") || null);
  });

  var $btnDrawMode = $(".toolbarButton.drawMode");
  $btnDrawMode.click(function(event) {
    $('#drawMenuToolbar').toggleClass('hidden');
  });
  $('#drawMenuToolbar .toolbarButton').each(function(_, elem) {
    var $elem = $(elem);
    $elem.click(function() {
      var mode = $(this).data('mode');
      // TODO(leon): This is an ugly hack to determine the previous mode
      $btnDrawMode.get(0).classList.forEach(function(c) {
        if (c !== 'drawMode' && c.indexOf('Mode') !== -1) {
          $btnDrawMode.removeClass(c);
        }
      });
      $btnDrawMode.addClass(mode + 'Mode');
      $('#drawMenuToolbar').addClass('hidden');
    });
  });

  $("#downloadPdf").click(function(event) {
    annotator.downloadPdf();
  });

  $("#secondaryToolbarClose").click(function() {
    history.back();
  });

  if (!can_update) {
    // User may not modify the file.
    $('#outerContainer').addClass('readonly');
    annotator.setDrawMode(null);
  }

  if (history.length <= 1) {
    // Annotation was opened in a new window. Closing windows through JS is not
    // possible - that's why we simply hide the button to not confuse users.
    $("#secondaryToolbarClose").hide();
  }
});

function setupPdfJs() {
  console.log("Loaded pdf.js", pdfjsLib.version, pdfjsLib.build);
  PDFViewerApplicationOptions.set("sidebarViewOnLoad", 0);
  PDFViewerApplicationOptions.set("showPreviousViewOnLoad", false);
  PDFViewerApplicationOptions.set("disablePageMode", true);
  PDFViewerApplicationOptions.set("isEvalSupported", false);
  PDFViewerApplicationOptions.set("cMapUrl", document.getElementsByTagName('head')[0].getAttribute('data-cmapurl'));
  PDFViewerApplicationOptions.set("workerSrc", document.getElementsByTagName('head')[0].getAttribute('data-workersrc'));
}

if (document.readyState === 'interactive' || document.readyState === 'complete') {
  setupPdfJs();
} else {
  document.addEventListener('DOMContentLoaded', setupPdfJs, true);
}
})();
