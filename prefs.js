import Adw from 'gi://Adw';
import Gio from 'gi://Gio';
import Gtk from 'gi://Gtk';
import {ExtensionPreferences} from 'resource:///org/gnome/Shell/Extensions/js/extensions/prefs.js';

const ICON_DIRECTIONS = ['auto', 'down', 'up', 'left', 'right'];
const ICON_DIRECTION_LABELS = [
    'Automatic (follow panel)',
    'Down',
    'Up',
    'Left',
    'Right',
];

export default class TrayDrawerPreferences extends ExtensionPreferences {
    fillPreferencesWindow(window) {
        const settings = this.getSettings();

        const page = new Adw.PreferencesPage();
        const group = new Adw.PreferencesGroup({
            title: 'Drawer button',
            description: 'By default the arrow points away from the panel edge, ' +
                'so it follows panels placed at the top, bottom, left or right.',
        });
        page.add(group);

        const directionRow = new Adw.ComboRow({
            title: 'Arrow direction',
            subtitle: 'Choose where the arrow points when the drawer is closed.',
            model: Gtk.StringList.new(ICON_DIRECTION_LABELS),
        });
        directionRow.selected = Math.max(0,
            ICON_DIRECTIONS.indexOf(settings.get_string('icon-direction')));
        group.add(directionRow);

        directionRow.connect('notify::selected', () => {
            settings.set_string('icon-direction',
                ICON_DIRECTIONS[directionRow.selected]);
        });
        settings.connect('changed::icon-direction', () => {
            directionRow.selected = Math.max(0,
                ICON_DIRECTIONS.indexOf(settings.get_string('icon-direction')));
        });

        const animateRow = new Adw.SwitchRow({
            title: 'Animate the arrow',
            subtitle: 'Rotate the arrow smoothly when the drawer opens or closes.',
        });
        settings.bind('animate-icon', animateRow, 'active', Gio.SettingsBindFlags.DEFAULT);
        group.add(animateRow);

        window.add(page);
    }
}
