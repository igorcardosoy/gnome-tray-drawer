import * as Main from 'resource:///org/gnome/shell/ui/main.js';

const APP_INDICATOR_PREFIX = 'appindicator-';

export function findAppIndicator(actor) {
    return Object.entries(Main.panel.statusArea).find(([key, item]) =>
        key.startsWith(APP_INDICATOR_PREFIX) &&
        item?.container === actor) ?? null;
}

export function getIndicatorName(actor, indicator) {
    if (indicator.accessibleName)
        return indicator.accessibleName;
    if (actor.accessible_name)
        return actor.accessible_name;

    const role = Object.entries(Main.panel.statusArea)
        .find(([, item]) => item === indicator)?.[0];
    return role?.replace(/^appindicator-/, '') ?? 'Application';
}

export function getIndicatorPreferenceId(legacyId, indicator) {
    const appId = indicator._indicator?.id?.trim();
    if (appId)
        return `app:${appId}`;

    const wmClass = indicator._icon?.wm_class?.trim();
    if (wmClass)
        return `wm-class:${wmClass}`;

    return legacyId;
}
