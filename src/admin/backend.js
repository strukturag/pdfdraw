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

/* global OCP, $, Handlebars */

(function(OC, OCP, OCA, $, _, Handlebars) {
  'use strict';

  OCA.PdfDraw = OCA.PdfDraw || {};
  OCA.PdfDraw.Admin = OCA.PdfDraw.Admin || {};
  OCA.PdfDraw.Admin.Backend = {

    $server: null,
    $secret: null,

    init: function() {
      this.$server = $('#backend_server');
      this.$secret = $('#shared_secret');

      this.$server.on('change', this.saveSettings.bind(this));
      this.$secret.on('change', this.saveSettings.bind(this));

      var data = $('div.backend').data('backend');
      this.$server.val(data.server);
      this.$secret.val(data.secret);
    },
    saveSettings: function() {
      var $success = [];
      var $error = [];
      var $server = this.$server;
      var server = this.$server.val().trim();
      var $secret = this.$secret;
      var secret = this.$secret.val().trim();

      this.$server.removeClass('error');
      this.$secret.removeClass('error');

      if (server === '') {
        $error.push($server);
      } else {
        $success.push($server);
      }
      if (secret === '') {
        $error.push($secret);
      } else {
        $success.push($secret);
      }

      OCP.AppConfig.setValue('pdfdraw', 'backend', JSON.stringify({
        server: server,
        secret: secret
      }), {
        success: function() {
          _.each($error, function($input) {
            $input.addClass('error');
          });
          _.each($success, function($server) {
            var $icon = $server.parent().find('.icon-checkmark-color');
            $icon.removeClass('hidden');
            setTimeout(function() {
              $icon.addClass('hidden');
            }, 2000);
          });
        }
      });
    }
  };
})(OC, OCP, OCA, $, _, Handlebars);

$(document).ready(function() {
  OCA.PdfDraw.Admin.Backend.init();
});
