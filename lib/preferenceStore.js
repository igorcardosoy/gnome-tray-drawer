import Gio from 'gi://Gio';
import GLib from 'gi://GLib';

export class PreferenceStore {
    constructor() {
        this._path = GLib.build_filenamev([
            GLib.get_user_config_dir(),
            'tray-drawer',
            'visibility.json',
        ]);
        this._visibility = new Map();
        this._disposed = false;
    }

    has(id) {
        return this._visibility.has(id);
    }

    get(id) {
        return this._visibility.get(id);
    }

    set(id, hidden) {
        this._visibility.set(id, hidden);
    }

    load() {
        const file = Gio.File.new_for_path(this._path);
        file.load_contents_async(null, (source, result) => {
            if (this._disposed)
                return;

            try {
                const [, contents] = source.load_contents_finish(result);
                const preferences = JSON.parse(new TextDecoder().decode(contents));
                if (!preferences || typeof preferences !== 'object' || Array.isArray(preferences))
                    throw new Error('Tray drawer preferences must be a JSON object');

                // Keep any choice the user made before this asynchronous load finished.
                for (const [id, hidden] of Object.entries(preferences)) {
                    if (typeof hidden === 'boolean' && !this._visibility.has(id))
                        this._visibility.set(id, hidden);
                }
            } catch (error) {
                if (error.matches?.(Gio.IOErrorEnum, Gio.IOErrorEnum.NOT_FOUND))
                    return;
                logError(error, 'Unable to load tray drawer preferences');
            }
        });
    }

    save() {
        try {
            const directory = GLib.path_get_dirname(this._path);
            if (GLib.mkdir_with_parents(directory, 0o755) !== 0)
                throw new Error(`Unable to create ${directory}`);

            const contents = JSON.stringify(Object.fromEntries(this._visibility));
            if (!GLib.file_set_contents(this._path, contents))
                throw new Error(`Unable to write ${this._path}`);
        } catch (error) {
            logError(error, 'Unable to save tray drawer preferences');
        }
    }

    dispose() {
        this._disposed = true;
    }
}
