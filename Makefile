app_name=pdfdraw

project_dir=$(CURDIR)/../$(app_name)
build_dir=$(CURDIR)/build/artifacts
appstore_dir=$(build_dir)/appstore
source_dir=$(build_dir)/source
sign_dir=$(build_dir)/sign
package_name=$(app_name)
cert_dir=$(HOME)/.nextcloud/certificates

POT_FILES=$(wildcard translationfiles/*/pdfdraw.po)

all: npm build

translationtool.phar:
	curl -L -o translationtool.phar https://github.com/nextcloud/docker-ci/raw/master/translations/translationtool/translationtool.phar
	chmod a+x translationtool.phar

.PHONY: pot
pot: translationtool.phar
	./translationtool.phar create-pot-files
	sed -i "s|$(CURDIR)/||" translationfiles/templates/pdfdraw.pot

.PHONY: po
po: $(POT_FILES)

translationfiles/%/pdfdraw.po: translationtool.phar pot
	msgmerge --update $@ translationfiles/templates/pdfdraw.pot

.PHONY: l10n
l10n: translationtool.phar
	./translationtool.phar convert-po-files

npm: package.json package-lock.json
	npm install

build: npm
	npm run build

clean:
	rm -rf $(CURDIR)/3rdparty/pdfjs
	rm -rf $(CURDIR)/js
	rm -rf $(build_dir)

appstore: clean build
	mkdir -p $(sign_dir)
	rsync -a \
	--exclude=/build \
	--exclude=.eslintignore \
	--exclude=.eslintrc.yml \
	--exclude=.git \
	--exclude=.github \
	--exclude=.gitignore \
	--exclude=.gitmodules \
	--exclude=Makefile \
	--exclude=node_modules \
	--exclude=src \
	--exclude=run-*lint.sh \
	--exclude=.stylelintrc \
	--exclude=vendors*js \
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
