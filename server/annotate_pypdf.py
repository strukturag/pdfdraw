##
## @copyright Copyright (C) 2020, struktur AG
##
## @author Joachim Bauch <mail@joachim-bauch.de>
##
## @license AGPL-3.0
##
## This program is free software: you can redistribute it and/or modify
## it under the terms of the GNU Affero General Public License as
## published by the Free Software Foundation, either version 3 of the
## License, or (at your option) any later version.
##
## This program is distributed in the hope that it will be useful,
## but WITHOUT ANY WARRANTY; without even the implied warranty of
## MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
## GNU Affero General Public License for more details.
##
## You should have received a copy of the GNU Affero General Public License
## along with this program.  If not, see <https://www.gnu.org/licenses/>.
##
from __future__ import print_function

from io import BytesIO
import sys
import time

try:
  basestring
except NameError:
  # Python 3
  basestring = str

try:
  from PyPDF2.generic import ArrayObject, BooleanObject, DictionaryObject, FloatObject, NameObject, RectangleObject, TextStringObject
  from PyPDF2.pdf import PdfFileReader, PdfFileWriter
except ImportError:
  # Development
  sys.path.append('PyPDF2')
  try:
    from PyPDF2.generic import ArrayObject, BooleanObject, DictionaryObject, FloatObject, NameObject, RectangleObject, TextStringObject
    from PyPDF2.pdf import PdfFileReader, PdfFileWriter
  except ImportError:
    # Fallback to package "python-pypdf" in the system.
    from pyPdf.generic import ArrayObject, BooleanObject, DictionaryObject, FloatObject, NameObject, RectangleObject, TextStringObject
    from pyPdf.pdf import PdfFileReader, PdfFileWriter

BYTE_TO_COLOR = 1.0 / 255.0

def annotate(fp_in, annotations):
  reader = PdfFileReader(fp_in)
  pdf = PdfFileWriter()
  for page in reader.pages:
    pdf.addPage(page)

  for annotation in annotations:
    page = annotation.get('page', 0)
    try:
      pdfpage = pdf.getPage(page)
    except IndexError:
      print('Page %d not found in pdf, not adding annotation %r' % (page, annotation), file=sys.stderr)
      continue

    size = pdfpage.mediaBox
    angle = int(pdfpage.get('/Rotate', 0))
    x = annotation['x']
    y = annotation['y']
    if angle == 0:
      x = float(x)
      y = float(size[3]) - float(y) - 20
    elif angle == 90:
      x, y = float(y) - 2, float(x) - 15
    else:
      x = float(x)
      y = float(y)
      print('Page rotated by %d degrees not implemented yet' % (angle), file=sys.stderr)

    color = annotation.get('color', None)
    if isinstance(color, basestring):
      if color[:1] != '#':
        print('Unsupported color format: %s' % (color), file=sys.stderr)
        color = None
      else:
        # Assume HTML color with format "#RRGGBB".
        try:
          color = int(color[1:], 16)
        except ValueError as e:
          print('Unsupported color format: %s (%s)' % (color, e), file=sys.stderr)
          color = None

    if color is not None:
      r, g, b = color >> 16, (color >> 8) & 0xff, color & 0xff
      color = (r * BYTE_TO_COLOR, g * BYTE_TO_COLOR, b * BYTE_TO_COLOR)
    else:
      color = None

    pages = pdf.getObject(pdf._pages)
    pageref = pages["/Kids"][page]

    anno = DictionaryObject()
    anno.update({
      NameObject('/Type'): NameObject('/Annot'),
      NameObject('/Subtype'): NameObject('/Text'),
      NameObject('/P'): pageref,
      NameObject('/Rect'): RectangleObject([x, y, x+18, y+20]),
      NameObject('/Contents'): TextStringObject(annotation['text']),
      NameObject('/C'): ArrayObject([FloatObject(x) for x in color]),
      NameObject('/Open'): BooleanObject(True),
    })
    author = annotation.get('author', None)
    if author:
      anno[NameObject('/T')] = TextStringObject(author)
    modified = annotation.get('modified', None)
    if modified:
      modified = time.strftime('%Y%m%d%H%M%SZ', time.gmtime(modified))
      anno[NameObject('/M')] = TextStringObject(modified)

    annoRef = pdf._addObject(anno)
    annots = pdfpage.get('/Annots', None)
    if annots is None:
      annots = pdfpage[NameObject('/Annots')] = ArrayObject([annoRef])
    else:
      annots.append(annoRef)

  fp_out = BytesIO()
  pdf.write(fp_out)
  return fp_out.getvalue()
