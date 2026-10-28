# Makefile for GNOME Tray Drawer Extension

UUID = tray-drawer@igorcardosoy
INSTALL_DIR = $(HOME)/.local/share/gnome-shell/extensions/$(UUID)
BUILD_DIR = build
ZIP_FILE = $(UUID).shell-extension.zip

# Files to include in the extension
FILES = extension.js metadata.json stylesheet.css

.PHONY: all install uninstall zip clean help

# Default target
all: help

# Install extension to local directory
install:
	@echo "Installing extension to $(INSTALL_DIR)..."
	@mkdir -p $(INSTALL_DIR)
	@cp -f $(FILES) $(INSTALL_DIR)/
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

# Create distributable zip file for extensions.gnome.org
zip: clean
	@echo "Creating distributable package..."
	@mkdir -p $(BUILD_DIR)
	@cp -f $(FILES) $(BUILD_DIR)/
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
	@echo "  install    - Install extension to ~/.local/share/gnome-shell/extensions/"
	@echo "  uninstall  - Remove extension from system"
	@echo "  zip        - Create distributable .zip package for extensions.gnome.org"
	@echo "  reload     - Re-enable extension (does not reload JavaScript; Wayland requires a new session)"
	@echo "  info       - Show extension information"
	@echo "  logs       - Show GNOME Shell logs (filtered for this extension)"
	@echo "  clean      - Remove build artifacts"
	@echo "  help       - Show this help message"
	@echo ""
	@echo "Quick start:"
	@echo "  make install && make reload"
