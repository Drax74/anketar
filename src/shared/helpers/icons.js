import icons from '../material-icons.json';

export function materialIcon(name) {
    const value = icons[name];
    if (!value) throw new Error(`Unknown Material icon: ${name}`);
    return String.fromCodePoint(parseInt(value, 16));
}
