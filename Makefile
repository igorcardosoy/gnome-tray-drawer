# Makefile for GNOME Tray Drawer Extension

UUID = tray-drawer@igorcardosoy
INSTALL_DIR = $(HOME)/.local/share/gnome-shell/extensions/$(UUID)
BUILD_DIR = build
ZIP_FILE = $(UUID).shell-extension.zip

PO_DIR = po
LOCALE_DIR = locale
DOMAIN = $(UUID)
PO_FILES = $(wildcard $(PO_DIR)/*.po)
MO_FILES = $(patsubst $(PO_DIR)/%.po,$(LOCALE_DIR)/%/LC_MESSAGES/$(DOMAIN).mo,$(PO_FILES))

# gettext 1.0+ consults git to produce a reproducible POT timestamp, but it
# prints spurious "vc-mtime" warnings in some checkouts. Older gettext has no
# such option, so only pass it when supported.
XGETTEXT_NO_GIT = $(shell xgettext --help 2>/dev/null | grep -q -- '--no-git' && echo --no-git)

# Files to include in the extension
FILES = extension.js metadata.json stylesheet.css prefs.js schemas $(wildcard locale) lib

.PHONY: all install uninstall zip clean distclean translations pot lint reload info logs help

# Default target
all: help

# Install extension to local directory
install: translations
	@echo "Installing extension to $(INSTALL_DIR)..."
	@mkdir -p $(INSTALL_DIR)
	@cp -rf $(FILES) $(INSTALL_DIR)/
	@glib-compile-schemas $(INSTALL_DIR)/schemas
	@echo "✓ Installation complete!"
	@echo ""
	@echo "Next steps:"
	@echo "  1. Restart GNOME Shell (logout/login on Wayland, or Alt+F2 -> 'r' on X11)"
	@echo "  2. Enable extension: gnome-extensions enable $(UUID)"

# Uninstall extension
uninstall:
	@echo "Uninstalling extension..."
	@rm -rf $(INSTALL_DIR)
	@echo "✓ Extension uninstalled"

# Compile gettext catalogs into locale/
translations: $(MO_FILES)

$(LOCALE_DIR)/%/LC_MESSAGES/$(DOMAIN).mo: $(PO_DIR)/%.po
	@mkdir -p $(dir $@)
	@msgfmt --output-file=$@ $<

# Refresh the translation template from the sources
pot:
	@mkdir -p $(PO_DIR)
	@xgettext $(XGETTEXT_NO_GIT) --from-code=UTF-8 --keyword=_ --keyword=ngettext:1,2 \
		--package-name="Tray Drawer" --output=$(PO_DIR)/$(DOMAIN).pot \
		extension.js prefs.js lib/*.js
	@echo "✓ Template updated: $(PO_DIR)/$(DOMAIN).pot"

# Run ESLint on the extension sources
lint:
	@npm run lint

# Create distributable zip file for extensions.gnome.org
zip: translations clean
	@echo "Creating distributable package..."
	@mkdir -p $(BUILD_DIR)
	@cp -rf $(FILES) $(BUILD_DIR)/
	@glib-compile-schemas $(BUILD_DIR)/schemas
	@cd $(BUILD_DIR) && zip -r ../$(ZIP_FILE) $(FILES)
	@rm -rf $(BUILD_DIR)
	@echo "✓ Package created: $(ZIP_FILE)"
	@echo ""
	@echo "Upload this file to https://extensions.gnome.org/"

# Clean build artifacts
clean:
	@echo "Cleaning build artifacts..."
	@rm -rf $(BUILD_DIR)
	@rm -f $(ZIP_FILE)
	@echo "✓ Clean complete"

# Clean everything, including compiled translations
distclean: clean
	@rm -rf $(LOCALE_DIR)
	@echo "✓ Compiled translations removed"

# Toggle extension (does not reload JavaScript modules in the current Shell)
reload:
	@echo "Disabling and re-enabling extension..."
	@gnome-extensions disable $(UUID) 2>/dev/null || true
	@gnome-extensions enable $(UUID)
	@echo "✓ Extension re-enabled"
	@echo "On Wayland, log out and back in to load changed JavaScript files."

# Show extension info
info:
	@gnome-extensions info $(UUID)

# Show extension logs
logs:
	@echo "Showing GNOME Shell logs (Ctrl+C to exit)..."
	@journalctl -f -o cat /usr/bin/gnome-shell | grep -i tray || true

# Help message
help:
	@echo "GNOME Tray Drawer - Build System"
	@echo ""
	@echo "Available targets:"
	@echo "  install      - Install extension to ~/.local/share/gnome-shell/extensions/"
	@echo "  uninstall    - Remove extension from system"
	@echo "  zip          - Create distributable .zip package for extensions.gnome.org"
	@echo "  translations - Compile po/*.po into locale/"
	@echo "  pot          - Regenerate the translation template from the sources"
	@echo "  lint         - Run ESLint on the extension sources"
	@echo "  reload       - Re-enable extension (does not reload JavaScript; Wayland requires a new session)"
	@echo "  info         - Show extension information"
	@echo "  logs         - Show GNOME Shell logs (filtered for this extension)"
	@echo "  clean        - Remove build artifacts"
	@echo "  distclean    - Remove build artifacts and compiled translations"
	@echo "  help         - Show this help message"
	@echo ""
	@echo "Quick start:"
	@echo "  make install && make reload"
