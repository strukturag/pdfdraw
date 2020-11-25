##
## @copyright Copyright (C) 2018, struktur AG
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
from cStringIO import StringIO
import sys

try:
  from pdfparser.Document import PDFDocument
except ImportError:
  # Development
  sys.path.append('pdfparser')
  from pdfparser.Document import PDFDocument

from pdfparser.StringTools import BOM_MAPPING

BYTE_TO_COLOR = 1.0 / 255.0

def encodePDFString(s):
  if not s:
    return s
  elif isinstance(s, unicode):
    return BOM_MAPPING['utf-16-be'] + s.encode('utf-16-be')

  try:
    s = unicode(s, 'utf-8').encode('latin-1')
  except UnicodeError:
    # not latin-1, encode as UTF-16 (little endian)
    s = BOM_MAPPING['utf-16-be'] + unicode(s, 'utf-8').encode('utf-16-be')
  return s

def annotate(fp_in, annotations):
  pdf = PDFDocument(fp_in)
  for annotation in annotations:
    page = annotation.get('page', 0)
    try:
      pdfpage = pdf.pages[page]
    except IndexError:
      print >> sys.stderr, 'Page %d not found in pdf, not adding annotations %r' % (page, annotation)
      continue

    size = pdfpage.getPageDimension()
    angle = int(pdfpage.get('/Rotate', 0))
    x = annotation['x']
    y = annotation['y']
    if angle == 0:
      x = float(x)
      y = size[3] - float(y) - 20
    elif angle == 90:
      x, y = float(y) - 2, float(x) - 15
    else:
      x = float(x)
      y = float(y)
      print >> sys.stderr, 'Page rotated by %d degrees not implemented yet' % (angle)

    color = annotation.get('color', None)
    if isinstance(color, basestring):
      if color[:1] != '#':
        print >> sys.stderr, 'Unsupported color format: %s' % (color)
        color = None
      else:
        # Assume HTML color with format "#RRGGBB".
        try:
          color = int(color[1:], 16)
        except ValueError as e:
          print >> sys.stderr, 'Unsupported color format: %s (%s)' % (color, e)
          color = None

    if color is not None:
      r, g, b = color >> 16, (color >> 8) & 0xff, color & 0xff
      color = (r * BYTE_TO_COLOR, g * BYTE_TO_COLOR, b * BYTE_TO_COLOR)
    else:
      color = None

    author = encodePDFString(annotation.get('author', None))
    modified = annotation.get('modified', None)
    pdf.addAnnotationAtPosition(x, y, encodePDFString(annotation['text']),
        width=18, height=20,
        startOpen=True,
        page=pdfpage,
        color=color,
        author=author or None,
        modified=modified or None)

  fp_out = StringIO()
  pdf.write(fp_out)
  return fp_out.getvalue()
