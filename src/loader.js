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

(function(OCA) {
  OCA.PdfDraw = OCA.PdfDraw || {};

  /**
   * @namespace OCA.FilesPdfViewer.PreviewPlugin
   */
  OCA.PdfDraw.PreviewPlugin = {

    /**
     * @param fileList
     */
    attach: function(fileList) {
      if (fileList.$el && fileList.$el.attr('id') === 'app-content-trashbin') {
        // Don't add action to files in trashbin.
        return;
      }

      fileList.fileActions.registerAction({
        displayName: t('pdfdraw', 'Annotate'),
        iconClass: 'icon-edit',
        name: 'Annotate',
        mime: 'application/pdf',
        permissions: OC.PERMISSION_READ,
        actionHandler: function(fileName, context) {
          var fileInfoModel = context.fileInfoModel || context.fileList.getModelForFile(fileName);
          this.show(fileInfoModel.id);
        }.bind(this)
      });
    },

    show: function(id) {
      var url = OC.generateUrl('/apps/pdfdraw/{id}', {
        id: id
      });
      if ($('#isPublic').val()) {
        url = OC.generateUrl('apps/pdfdraw/s/{token}?fileId={id}', {
          'id': id,
          'token': $("#sharingToken").val()
        });
      }

      location.href = url;
    }
  };
})(OCA);

OC.Plugins.register('OCA.Files.FileList', OCA.PdfDraw.PreviewPlugin);

var oldShow;
if (OCA.FilesPdfViewer && OCA.FilesPdfViewer.PreviewPlugin) {
  oldShow = OCA.FilesPdfViewer.PreviewPlugin.show;

  OCA.FilesPdfViewer.PreviewPlugin.show = function(url, params, isFileList) {
    if (typeof(isFileList) === "undefined") {
      // Nextcloud 14 doesn't pass the "params".
      isFileList = params;
    }
    if (!isFileList) {
      // Prevent opening the PDF when user clicks on publicly shared file.
      return;
    }

    return oldShow.apply(this, arguments);
  };
}

document.addEventListener("webviewerloaded", function(event) {
  var locale = OC.getLocale();
  if (locale && event.detail && event.detail.source && event.detail.source.PDFViewerApplicationOptions) {
    var PDFViewerApplicationOptions = event.detail.source.PDFViewerApplicationOptions;
    PDFViewerApplicationOptions.set('locale', locale.replace('_', '-'));
  }
});

$(document).ready(function() {
  if (OCA.Sharing && OCA.Sharing.PublicApp) {
    var mimetype = $("#mimetype");
    var download = $(".directDownload");
    if (download.length && mimetype.val() === 'application/pdf') {
      var token = $('#sharingToken').val();
      var button = $("<a id='annotateFile' class='button' href=''><span class='icon icon-download'></span>" + t('pdfdraw', 'Annotate') + "</a>");
      var url = OC.generateUrl('apps/pdfdraw/s/{token}', {
        'token': token
      });
      button.attr('href', url);
      download.append(button);

      if (oldShow) {
        var downloadButton = $("#downloadFile");
        downloadButton.html("<span class='icon icon-download'></span>" + t('pdfdraw', 'Open'));
        downloadButton.click(function(event) {
          event.preventDefault();
          var downloadUrl = OC.generateUrl('/s/{token}/download', {token: token});
          return oldShow.call(OCA.FilesPdfViewer.PreviewPlugin, downloadUrl, false);
        });
      }
    }
  }
});
