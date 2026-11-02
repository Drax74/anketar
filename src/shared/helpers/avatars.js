const AVATAR_PALETTE = ['#647FA8', '#648C79', '#B87983', '#B58A45', '#8A78B5', '#B97655', '#4E9290', '#858B98'];

export function avatarColor(identifier) {
    let hash = 0;
    const text = String(identifier);
    for (let index = 0; index < text.length; index++) hash = text.charCodeAt(index) + ((hash << 5) - hash);
    return AVATAR_PALETTE[Math.abs(hash) % AVATAR_PALETTE.length];
}
