# GNOME Tray Drawer

A GNOME Shell extension that lets you hide application tray icons and open them from a small drawer.

## Requirements

- GNOME Shell 47 or later
- Applications that provide AppIndicator tray icons

## Install

From the project directory, run:

```sh
make install
```

Then restart GNOME Shell (log out and back in on Wayland) and enable the extension:

```sh
gnome-extensions enable tray-drawer@igorcardosoy
```

You can also install with `./install.sh`.

## Use

- Middle-click a tray icon to move it between the panel and the drawer.
- Click the drawer button in the top panel to open hidden icons.
- Your icon visibility choices are saved automatically.

## Uninstall

```sh
make uninstall
```
