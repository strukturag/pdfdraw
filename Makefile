PDFJS_VERSION=2.0.943

all: 3rdparty

3rdparty: pdfjs

pdfjs-${PDFJS_VERSION}-dist.zip:
	wget https://github.com/mozilla/pdf.js/releases/download/v${PDFJS_VERSION}/pdfjs-${PDFJS_VERSION}-dist.zip

pdfjs: pdfjs-${PDFJS_VERSION}-dist.zip
	mkdir -p 3rdparty/pdfjs
	unzip -qo pdfjs-${PDFJS_VERSION}-dist.zip -d 3rdparty/pdfjs

build: 3rdparty
