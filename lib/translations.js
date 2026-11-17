import Gio from 'gi://Gio';
import GLib from 'gi://GLib';

const CONTEXT_SEPARATOR = '\u0004';
const SYSTEM_LANGUAGE = 'system';
const SOURCE_LANGUAGE = 'en';

let domain = null;
let localeDirPath = null;
let overrideCatalog = null;

/**
 * Selects the catalog used by the extension user interface. With the "system"
 * language the fallback goes through GLib.dgettext, which resolves the locale
 * that the session bound for this extension; any other value loads the
 * matching catalog from the extension locale directory.
 *
 * @param {object} options
 * @param {string} options.domain the extension gettext domain
 * @param {string} options.dir path of the extension directory
 * @param {Gio.Settings} options.settings settings that hold "ui-language"
 */
export function initTranslations({domain: newDomain, dir, settings}) {
    domain = newDomain;
    localeDirPath = dir;
    overrideCatalog = loadCatalog(settings.get_string('ui-language'));
}

/**
 * Re-reads the "ui-language" choice after it changes.
 *
 * @param {Gio.Settings} settings settings that hold "ui-language"
 */
export function reloadTranslations(settings) {
    overrideCatalog = loadCatalog(settings.get_string('ui-language'));
}

export const gettext = str => overrideCatalog
    ? overrideCatalog.get(str) ?? str
    : GLib.dgettext(domain, str);

export const pgettext = (context, str) => {
    const key = `${context}${CONTEXT_SEPARATOR}${str}`;
    if (overrideCatalog)
        return overrideCatalog.get(key) ?? str;

    // The .mo table stores contextual entries as "context\x04msgid".
    const translated = GLib.dgettext(domain, key);
    return translated === key ? str : translated;
};

function loadCatalog(language) {
    if (language === SYSTEM_LANGUAGE || domain === null || localeDirPath === null)
        return null;

    // The source language is the untranslated msgid; an empty catalog makes
    // every lookup fall back to the English strings.
    if (language === SOURCE_LANGUAGE)
        return new Map();

    const path = GLib.build_filenamev([
        localeDirPath,
        'locale',
        language,
        'LC_MESSAGES',
        `${domain}.mo`,
    ]);
    const file = Gio.File.new_for_path(path);
    if (!file.query_exists(null))
        return null;

    const [, contents] = file.load_contents(null);
    return parseMo(contents);
}

function parseMo(contents) {
    const view = new DataView(contents.buffer, contents.byteOffset, contents.byteLength);
    const magic = view.getUint32(0, true);
    const littleEndian = magic === 0x950412de;
    if (!littleEndian && magic !== 0xde120495)
        return null;
    const read32 = offset => view.getUint32(offset, littleEndian);

    const count = read32(8);
    const decoder = new TextDecoder();
    const readEntry = offset => {
        const length = read32(offset);
        const dataOffset = read32(offset + 4);
        return decoder.decode(
            new Uint8Array(contents.buffer, contents.byteOffset + dataOffset, length));
    };

    const catalog = new Map();
    for (let i = 0; i < count; i++) {
        const original = readEntry(read32(12) + i * 8);
        const translated = readEntry(read32(16) + i * 8);
        if (translated)
            catalog.set(original, translated);
    }
    return catalog;
}
