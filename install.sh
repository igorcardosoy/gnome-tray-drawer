#!/bin/bash
# Simple installation script for GNOME Tray Drawer Extension

set -e

UUID="tray-drawer@igorcardosoy"
INSTALL_DIR="$HOME/.local/share/gnome-shell/extensions/$UUID"

echo "========================================"
echo "  GNOME Tray Drawer - Installation"
echo "========================================"
echo ""

# Check if GNOME Shell is running
if ! pgrep -x "gnome-shell" > /dev/null; then
    echo "⚠️  Warning: GNOME Shell is not running"
    echo "   This extension requires GNOME Shell"
    read -p "Continue anyway? (y/N) " -n 1 -r
    echo
    if [[ ! $REPLY =~ ^[Yy]$ ]]; then
        exit 1
    fi
fi

# Get GNOME Shell version
GNOME_VERSION=$(gnome-shell --version | grep -oP '\d+' | head -1)
echo "📦 Detected GNOME Shell version: $GNOME_VERSION"

if [ "$GNOME_VERSION" -lt 47 ]; then
    echo "❌ Error: This extension requires GNOME Shell 47 or later"
    exit 1
fi

# Create installation directory
echo "📁 Creating installation directory..."
mkdir -p "$INSTALL_DIR"

# Copy files
echo "📋 Copying extension files..."
cp -rf extension.js metadata.json stylesheet.css lib "$INSTALL_DIR/"

echo "✓ Installation complete!"
echo ""
echo "Next steps:"
echo "  1. Restart GNOME Shell:"
if [ "$XDG_SESSION_TYPE" = "wayland" ]; then
    echo "     - Log out and log back in (Wayland)"
else
    echo "     - Press Alt+F2, type 'r', press Enter (X11)"
fi
echo "  2. Enable the extension:"
echo "     gnome-extensions enable $UUID"
echo ""
echo "To uninstall:"
echo "  rm -rf $INSTALL_DIR"
echo ""
