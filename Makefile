PDFJS_VERSION=2.0.943

app_name=pdfdraw

project_dir=$(CURDIR)/../$(app_name)
build_dir=$(CURDIR)/build/artifacts
appstore_dir=$(build_dir)/appstore
source_dir=$(build_dir)/source
sign_dir=$(build_dir)/sign
package_name=$(app_name)
cert_dir=$(HOME)/.nextcloud/certificates

all: 3rdparty

3rdparty: pdfjs

pdfjs-${PDFJS_VERSION}-dist.zip:
	wget https://github.com/mozilla/pdf.js/releases/download/v${PDFJS_VERSION}/pdfjs-${PDFJS_VERSION}-dist.zip

pdfjs: pdfjs-${PDFJS_VERSION}-dist.zip
	mkdir -p 3rdparty/pdfjs
	unzip -qo pdfjs-${PDFJS_VERSION}-dist.zip -d 3rdparty/pdfjs

build: 3rdparty

clean:
	rm -rf $(build_dir)

appstore: clean build
	mkdir -p $(sign_dir)
	rsync -a \
	--exclude=build \
	--exclude=.eslintignore \
	--exclude=.eslintrc.yml \
	--exclude=.git \
	--exclude=.github \
	--exclude=.gitignore \
	--exclude=.gitmodules \
	--exclude=Makefile \
	--exclude=node_modules \
	--exclude=pdfjs*.zip \
	--exclude=package.json \
	--exclude=run-*lint.sh \
	--exclude=.stylelintrc \
	$(project_dir)/ \
	$(sign_dir)/$(app_name)
	@if [ -f $(cert_dir)/$(app_name).key ]; then \
		echo "Signing app files…"; \
		php ../../occ integrity:sign-app \
			--privateKey=$(cert_dir)/$(app_name).key\
			--certificate=$(cert_dir)/$(app_name).crt\
			--path=$(sign_dir)/$(app_name); \
	fi
	tar -czf $(build_dir)/$(app_name)-$(version).tar.gz \
		--owner=root --group=root \
		-C $(sign_dir) $(app_name)
	@if [ -f $(cert_dir)/$(app_name).key ]; then \
		echo "Signing package…"; \
		openssl dgst -sha512 -sign $(cert_dir)/$(app_name).key $(build_dir)/$(app_name)-$(version).tar.gz | openssl base64; \
	fi
