# GNOME Tray Drawer

A GNOME Shell extension that lets you hide application tray icons and open them from a small drawer.

## Requirements

- GNOME Shell 47 or later
- The [AppIndicator and KStatusNotifierItem Support](https://extensions.gnome.org/extension/615/appindicator-support/) GNOME Shell extension, installed and enabled (`appindicatorsupport@rgcjonas.gmail.com`). Tray Drawer manages the tray icons exposed by this extension.
- Applications that provide AppIndicator or KStatusNotifierItem tray icons

## Install

Install and enable the AppIndicator extension first if it is not already enabled. Then, from the project directory, run:

```sh
make install
```

Then restart GNOME Shell (log out and back in on Wayland) and enable the extension:

```sh
gnome-extensions enable tray-drawer@igorcardosoy
```

You can also install with `./install.sh`.

## Use

- Drag a tray icon onto the drawer button (or into the open drawer) to hide it, and drag it back onto the panel to restore it at the drop position.
- Middle-click a tray icon to move it between the panel and the drawer.
- Click the drawer button in the top panel to open hidden icons.
- The drawer button arrow follows the panel edge: it points down for a top panel, up for a bottom panel, right for a left panel and left for a right panel. Opening the drawer flips the arrow with a short rotation animation (both the flip and the animation can be disabled in the preferences).
- Your icon visibility choices are saved automatically and preserved when an app restarts.

## Preferences

Open the extension preferences (for example with `gnome-extensions prefs tray-drawer@igorcardosoy` or the gear button in the Extensions app) to:

- Choose the arrow direction: **Automatic** (default, follows the panel edge) or a fixed direction: down, up, left or right.
- Enable or disable rotating the arrow when the drawer opens.
- Enable or disable the arrow animation (only available while the arrow rotates).

## Uninstall

```sh
make uninstall
```

## Translations

Translatable strings are marked with `_()` and the gettext domain is defined in `metadata.json`. The catalogs live in `po/`:

```sh
make pot          # regenerate po/tray-drawer@igorcardosoy.pot after string changes
make translations # compile po/*.po into locale/
```

`make install` and `make zip` compile the catalogs automatically (requires `gettext`). Please do not include new languages that you cannot review yourself.

## Development

Install the development dependencies and run the linter:

```sh
npm install
make lint
```
